import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log } from "../_shared/log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic",
};

async function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string | undefined) {
  if (!hmacHeader || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const digestBytes = new Uint8Array(sig);
  const headerBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  if (digestBytes.length !== headerBytes.length) return false;
  let out = 0;
  for (let i = 0; i < digestBytes.length; i++) out |= digestBytes[i] ^ headerBytes[i];
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get webhook secret from system_settings table
    const { data: webhookSetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'SHOPIFY_WEBHOOK_SECRET',
        fallbackSecretName: 'SHOPIFY_WEBHOOK_SECRET'
      }
    });

    const SHOPIFY_WEBHOOK_SECRET = webhookSetting?.value;
    const topic = req.headers.get("x-shopify-topic");
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    const raw = await req.text();

    const isValid = await verifyHmac(raw, hmac, SHOPIFY_WEBHOOK_SECRET);
    if (!isValid) {
      console.warn("Invalid Shopify webhook HMAC");
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }

    const payload = JSON.parse(raw);

    // Handle inventory level updates from Shopify (two-way sync)
    if (topic === "inventory_levels/update") {
      log.info("Processing Shopify inventory level update", {
        topic,
        inventoryItemId: payload?.inventory_item_id,
        locationId: payload?.location_id,
        available: payload?.available
      });

      try {
        const inventoryItemId = payload?.inventory_item_id?.toString();
        const locationId = payload?.location_id?.toString();
        const available = parseInt(payload?.available) || 0;

        if (!inventoryItemId || !locationId) {
          log.warn("Missing required fields for inventory update", { inventoryItemId, locationId });
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find items with this inventory_item_id
        const { data: items, error: itemsError } = await supabase
          .from("intake_items")
          .select("id, sku, quantity, shopify_inventory_item_id, shopify_location_gid")
          .eq("shopify_inventory_item_id", inventoryItemId)
          .is("deleted_at", null)
          .not("removed_from_batch_at", "is", null);

        if (itemsError) {
          log.error("Failed to fetch items for inventory update", {
            inventoryItemId,
            error: itemsError.message
          });
          throw itemsError;
        }

        if (!items || items.length === 0) {
          log.info("No matching items found for inventory update", { inventoryItemId });
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Calculate current total quantity for this inventory item and location
        const locationGid = `gid://shopify/Location/${locationId}`;
        const currentTotal = items
          .filter(item => item.shopify_location_gid === locationGid)
          .reduce((sum, item) => sum + (item.quantity || 0), 0);

        // If quantities match, no action needed
        if (currentTotal === available) {
          log.info("Quantities already match, no update needed", {
            inventoryItemId,
            locationId,
            currentTotal,
            shopifyAvailable: available
          });
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update shopify sync status for tracking
        const updatePromises = items
          .filter(item => item.shopify_location_gid === locationGid)
          .map(item => 
            supabase
              .from("intake_items")
              .update({
                shopify_sync_status: 'shopify_updated',
                last_shopify_synced_at: new Date().toISOString(),
                last_shopify_sync_error: null
              })
              .eq("id", item.id)
          );

        await Promise.all(updatePromises);

        log.info("Processed Shopify inventory update", {
          inventoryItemId,
          locationId,
          currentTotal,
          shopifyAvailable: available,
          itemsUpdated: items.length
        });

      } catch (error) {
        log.error("Error processing inventory level update", {
          error: error.message,
          payload
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle order-related updates: decrement quantity by sold amount per SKU with multi-row allocation
    if (topic && topic.startsWith("orders/")) {
      log.info("Processing Shopify order webhook", {
        topic,
        orderId: payload?.id,
        lineItemsCount: payload?.line_items?.length || 0
      });

      const lineItems: any[] = payload?.line_items || [];
      const results = [];

      for (const li of lineItems) {
        const sku: string | undefined = li?.sku || undefined;
        const requestedQty: number = Number(li?.quantity || 0);
        
        if (!sku || requestedQty <= 0) {
          log.warn("Skipping line item - invalid SKU or quantity", {
            sku,
            requestedQty,
            lineItemId: li?.id
          });
          continue;
        }

        log.info("Processing line item", {
          sku,
          requestedQty,
          lineItemId: li?.id,
          productId: li?.product_id,
          variantId: li?.variant_id
        });

        // Find all eligible rows for this SKU, ordered by creation date
        const { data: rows, error } = await supabase
          .from("intake_items")
          .select("id, quantity, lot_number, created_at")
          .eq("sku", sku)
          .is("deleted_at", null)
          .not("pushed_at", "is", null)
          .gt("quantity", 0)
          .order("created_at", { ascending: true });

        if (error) {
          log.error("Failed to fetch intake items", {
            sku,
            error: error.message
          });
          throw error;
        }

        if (!rows || rows.length === 0) {
          log.warn("No eligible intake items found for SKU", {
            sku,
            requestedQty
          });
          results.push({
            sku,
            requestedQty,
            allocatedQty: 0,
            status: 'no_inventory'
          });
          continue;
        }

        // Multi-row allocation: cascade decrements across rows
        let remainingQty = requestedQty;
        const allocations = [];
        let totalAvailable = rows.reduce((sum, row) => sum + row.quantity, 0);

        for (const row of rows) {
          if (remainingQty <= 0) break;

          const availableInRow = Number(row.quantity || 0);
          const allocateFromRow = Math.min(remainingQty, availableInRow);
          const newQty = availableInRow - allocateFromRow;

          // Update the row
          const { error: updateError } = await supabase
            .from("intake_items")
            .update({ quantity: newQty })
            .eq("id", row.id);

          if (updateError) {
            log.error("Failed to update intake item quantity", {
              itemId: row.id,
              sku,
              originalQty: availableInRow,
              attemptedDeduction: allocateFromRow,
              error: updateError.message
            });
            throw updateError;
          }

          allocations.push({
            itemId: row.id,
            lotNumber: row.lot_number,
            originalQty: availableInRow,
            allocatedQty: allocateFromRow,
            newQty: newQty,
            createdAt: row.created_at
          });

          remainingQty -= allocateFromRow;

          log.info("Applied quantity decrement", {
            itemId: row.id,
            sku,
            lotNumber: row.lot_number,
            originalQty: availableInRow,
            allocatedQty: allocateFromRow,
            newQty: newQty,
            remainingToAllocate: remainingQty
          });
        }

        const totalAllocated = requestedQty - remainingQty;
        const allocationStatus = remainingQty > 0 ? 'partial_allocation' : 'fully_allocated';

        log.info("Completed SKU allocation", {
          sku,
          requestedQty,
          totalAllocated,
          remainingQty,
          totalAvailable,
          rowsProcessed: allocations.length,
          status: allocationStatus,
          allocations: allocations
        });

        results.push({
          sku,
          requestedQty,
          allocatedQty: totalAllocated,
          remainingQty,
          totalAvailable,
          status: allocationStatus,
          allocations
        });

        // Log warning if we couldn't fulfill the full quantity
        if (remainingQty > 0) {
          log.warn("Partial allocation - insufficient inventory", {
            sku,
            requestedQty,
            allocatedQty: totalAllocated,
            shortfall: remainingQty,
            totalAvailable
          });
        }
      }

      log.info("Completed order processing", {
        orderId: payload?.id,
        topic,
        totalLineItems: lineItems.length,
        processedResults: results.length,
        summary: results
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("shopify-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
