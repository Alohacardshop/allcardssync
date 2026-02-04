import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adjustInventorySafe, getInventoryLevel } from '../_shared/shopify-helpers.ts';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransferRequest {
  transfer_id: string;
  item_ids: string[];
  source_location_gid: string;
  destination_location_gid: string;
  store_key: string;
}

interface TransferResult {
  item_id: string;
  sku: string | null;
  success: boolean;
  error?: string;
  before_source_qty?: number;
  after_source_qty?: number;
  before_dest_qty?: number;
  after_dest_qty?: number;
  rolled_back?: boolean;
}

interface LocationInfo {
  gid: string;
  id: string;
  name: string | null;
}

/**
 * Write comprehensive audit log entry for inventory transfers
 */
async function writeTransferAudit(
  supabase: any,
  action: string,
  itemId: string,
  userId: string,
  userEmail: string,
  sourceLocation: LocationInfo,
  destLocation: LocationInfo,
  transferDetails: {
    transfer_id: string;
    sku: string | null;
    quantity: number;
    before_source_qty?: number;
    after_source_qty?: number;
    before_dest_qty?: number;
    after_dest_qty?: number;
    success: boolean;
    error?: string;
  }
) {
  try {
    await supabase.from('audit_log').insert({
      action,
      table_name: 'intake_items',
      record_id: itemId,
      user_id: userId,
      user_email: userEmail,
      location_gid: destLocation.gid,
      old_data: {
        shopify_location_gid: sourceLocation.gid,
        location_name: sourceLocation.name,
        available_qty: transferDetails.before_source_qty,
      },
      new_data: {
        shopify_location_gid: destLocation.gid,
        location_name: destLocation.name,
        transfer_id: transferDetails.transfer_id,
        sku: transferDetails.sku,
        quantity_moved: transferDetails.quantity,
        source_qty_after: transferDetails.after_source_qty,
        dest_qty_after: transferDetails.after_dest_qty,
        success: transferDetails.success,
        error: transferDetails.error,
      },
    });
  } catch (e) {
    console.error('Failed to write audit entry:', e);
  }
}

/**
 * Update local inventory_levels table atomically for both locations
 */
async function updateInventoryLevelsLocal(
  supabase: any,
  storeKey: string,
  inventoryItemId: string,
  sourceLocation: LocationInfo,
  destLocation: LocationInfo,
  quantity: number,
  beforeSourceQty: number,
  afterSourceQty: number,
  beforeDestQty: number,
  afterDestQty: number
) {
  const now = new Date().toISOString();

  // Update source location (decrement)
  const { error: sourceError } = await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: sourceLocation.gid,
      location_name: sourceLocation.name,
      available: afterSourceQty,
      updated_at: now,
    }, {
      onConflict: 'store_key,inventory_item_id,location_gid'
    });

  if (sourceError) {
    console.error('Failed to update source inventory level:', sourceError);
  }

  // Update destination location (increment)
  const { error: destError } = await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: destLocation.gid,
      location_name: destLocation.name,
      available: afterDestQty,
      updated_at: now,
    }, {
      onConflict: 'store_key,inventory_item_id,location_gid'
    });

  if (destError) {
    console.error('Failed to update dest inventory level:', destError);
  }
}

/**
 * Rollback local inventory_levels if Shopify adjustment fails
 */
async function rollbackInventoryLevels(
  supabase: any,
  storeKey: string,
  inventoryItemId: string,
  sourceLocationGid: string,
  destLocationGid: string,
  originalSourceQty: number,
  originalDestQty: number
) {
  const now = new Date().toISOString();

  await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: sourceLocationGid,
      available: originalSourceQty,
      updated_at: now,
    }, { onConflict: 'store_key,inventory_item_id,location_gid' });

  await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: destLocationGid,
      available: originalDestQty,
      updated_at: now,
    }, { onConflict: 'store_key,inventory_item_id,location_gid' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Authenticated user:', user.id);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { transfer_id, item_ids, source_location_gid, destination_location_gid, store_key } =
      await req.json() as TransferRequest;

    console.log(`🔄 Starting bulk transfer ${transfer_id} for ${item_ids.length} items`);
    console.log(`   Source: ${source_location_gid} → Dest: ${destination_location_gid}`);

    // Fetch location names from cache
    const { data: locationCache } = await supabase
      .from('shopify_location_cache')
      .select('location_gid, location_name')
      .eq('store_key', store_key)
      .in('location_gid', [source_location_gid, destination_location_gid]);

    const locationNames = new Map<string, string>();
    for (const loc of locationCache || []) {
      locationNames.set(loc.location_gid, loc.location_name);
    }

    const sourceLocation: LocationInfo = {
      gid: source_location_gid,
      id: source_location_gid.split('/').pop()!,
      name: locationNames.get(source_location_gid) || null,
    };

    const destLocation: LocationInfo = {
      gid: destination_location_gid,
      id: destination_location_gid.split('/').pop()!,
      name: locationNames.get(destination_location_gid) || null,
    };

    // Fetch items to transfer - verify they're at source location
    const { data: items, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, sku, brand_title, subject, card_number, quantity, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_location_gid')
      .in('id', item_ids)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      throw new Error('No valid items found');
    }

    // Filter to only items at source location
    const validItems = items.filter(item => item.shopify_location_gid === source_location_gid);
    const skippedItems = items.filter(item => item.shopify_location_gid !== source_location_gid);

    if (skippedItems.length > 0) {
      console.log(`⚠️ Skipping ${skippedItems.length} items not at source location`);
    }

    if (validItems.length === 0) {
      throw new Error('No items found at the source location');
    }

    console.log(`✅ Found ${validItems.length} valid items to transfer`);

    // Resolve Shopify credentials using shared helper
    const configResult = await resolveShopifyConfig(supabase, store_key);
    
    if (!configResult.ok) {
      throw new Error(`Shopify config error: ${configResult.message}`);
    }

    const { domain: shopifyDomain, accessToken: shopifyToken } = configResult.credentials;

    let successCount = 0;
    let failCount = 0;
    const results: TransferResult[] = [];

    // Process each item sequentially to prevent race conditions
    for (const item of validItems) {
      const itemName = `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim();
      const result: TransferResult = { 
        item_id: item.id, 
        sku: item.sku,
        success: false 
      };
      
      try {
        if (!item.shopify_inventory_item_id) {
          throw new Error('Item has no Shopify inventory item ID');
        }

        // Step 1: Fetch current levels from Shopify (source of truth)
        const [sourceLevel, destLevel] = await Promise.all([
          getInventoryLevel(shopifyDomain, shopifyToken, item.shopify_inventory_item_id, sourceLocation.id),
          getInventoryLevel(shopifyDomain, shopifyToken, item.shopify_inventory_item_id, destLocation.id),
        ]);

        const sourceQty = sourceLevel?.available ?? 0;
        const destQty = destLevel?.available ?? 0;

        result.before_source_qty = sourceQty;
        result.before_dest_qty = destQty;

        // Step 2: CRITICAL - Prevent negative inventory
        if (sourceQty < item.quantity) {
          throw new Error(`INSUFFICIENT_INVENTORY: have ${sourceQty} at source, need ${item.quantity}`);
        }

        // Step 3: Use delta-based adjustments with optimistic locking
        // Decrement source location
        const adjustSourceResult = await adjustInventorySafe(
          shopifyDomain,
          shopifyToken,
          item.shopify_inventory_item_id,
          sourceLocation.id,
          -item.quantity, // negative delta
          sourceQty // expected value for optimistic lock
        );

        if (!adjustSourceResult.success) {
          if (adjustSourceResult.stale) {
            throw new Error(`STALE_SOURCE: Expected ${sourceQty}, Shopify has ${adjustSourceResult.previous_available}. Refresh required.`);
          }
          throw new Error(`SOURCE_ADJUST_FAILED: ${adjustSourceResult.error}`);
        }

        result.after_source_qty = adjustSourceResult.new_available;

        // Step 4: Increment destination location
        const adjustDestResult = await adjustInventorySafe(
          shopifyDomain,
          shopifyToken,
          item.shopify_inventory_item_id,
          destLocation.id,
          item.quantity, // positive delta
          destQty // expected value for optimistic lock
        );

        if (!adjustDestResult.success) {
          // CRITICAL: Rollback source adjustment
          console.log(`⚠️ Rolling back source for item ${item.id}`);
          const rollbackResult = await adjustInventorySafe(
            shopifyDomain,
            shopifyToken,
            item.shopify_inventory_item_id,
            sourceLocation.id,
            item.quantity // add back what we subtracted
          );
          
          result.rolled_back = rollbackResult.success;
          
          if (adjustDestResult.stale) {
            throw new Error(`STALE_DEST: Expected ${destQty}, Shopify has ${adjustDestResult.previous_available}. Rolled back source. Refresh required.`);
          }
          throw new Error(`DEST_ADJUST_FAILED: ${adjustDestResult.error}. Rolled back source.`);
        }

        result.after_dest_qty = adjustDestResult.new_available;

        // Step 5: Update local inventory_levels table to match Shopify
        await updateInventoryLevelsLocal(
          supabase,
          store_key,
          item.shopify_inventory_item_id,
          sourceLocation,
          destLocation,
          item.quantity,
          sourceQty,
          adjustSourceResult.new_available ?? (sourceQty - item.quantity),
          destQty,
          adjustDestResult.new_available ?? (destQty + item.quantity)
        );

        // Step 6: Update intake_items location
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({ 
            shopify_location_gid: destination_location_gid,
            last_shopify_location_gid: destination_location_gid,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
            // Clear any drift flag since we just synced
            shopify_drift: false,
            shopify_drift_detected_at: null,
            shopify_drift_details: null,
          })
          .eq('id', item.id);

        if (updateError) throw updateError;

        // Step 7: Update cards table for 1-of-1 items
        if (item.sku) {
          await supabase
            .from('cards')
            .update({
              current_shopify_location_id: destination_location_gid,
              updated_at: new Date().toISOString()
            })
            .eq('sku', item.sku);
        }

        // Step 8: Write detailed audit log
        await writeTransferAudit(
          supabase,
          'LOCATION_TRANSFER',
          item.id,
          user.id,
          user.email || '',
          sourceLocation,
          destLocation,
          {
            transfer_id,
            sku: item.sku,
            quantity: item.quantity,
            before_source_qty: sourceQty,
            after_source_qty: result.after_source_qty,
            before_dest_qty: destQty,
            after_dest_qty: result.after_dest_qty,
            success: true,
          }
        );

        // Step 9: Log success in transfer items
        await supabase.from('location_transfer_items').insert({
          transfer_id,
          intake_item_id: item.id,
          sku: item.sku || '',
          item_name: itemName,
          quantity: item.quantity,
          status: 'success',
          shopify_product_id: item.shopify_product_id,
          shopify_variant_id: item.shopify_variant_id,
          processed_at: new Date().toISOString(),
        });

        result.success = true;
        results.push(result);
        successCount++;
        console.log(`✅ ${item.sku}: ${sourceQty}→${result.after_source_qty} @ source, ${destQty}→${result.after_dest_qty} @ dest`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.error = errorMsg;
        results.push(result);
        failCount++;
        console.error(`❌ ${item.sku || item.id}: ${errorMsg}`);

        // Write failure audit
        await writeTransferAudit(
          supabase,
          'LOCATION_TRANSFER_FAILED',
          item.id,
          user.id,
          user.email || '',
          sourceLocation,
          destLocation,
          {
            transfer_id,
            sku: item.sku,
            quantity: item.quantity,
            before_source_qty: result.before_source_qty,
            before_dest_qty: result.before_dest_qty,
            success: false,
            error: errorMsg,
          }
        );

        await supabase.from('location_transfer_items').insert({
          transfer_id,
          intake_item_id: item.id,
          sku: item.sku || '',
          item_name: itemName,
          quantity: item.quantity,
          status: 'failed',
          shopify_product_id: item.shopify_product_id,
          shopify_variant_id: item.shopify_variant_id,
          error_message: errorMsg,
          processed_at: new Date().toISOString(),
        });
      }
    }

    // Update transfer record with final status
    const finalStatus = failCount === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'partial');
    await supabase
      .from('location_transfers')
      .update({
        successful_items: successCount,
        failed_items: failCount,
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', transfer_id);

    console.log(`🎯 Transfer ${transfer_id} complete: ${successCount}/${validItems.length} succeeded`);

    return new Response(
      JSON.stringify({
        success: failCount === 0,
        total: validItems.length,
        skipped: skippedItems.length,
        successful: successCount,
        failed: failCount,
        status: finalStatus,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Transfer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});