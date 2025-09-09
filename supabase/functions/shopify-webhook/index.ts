import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-webhook-id, x-shopify-hmac-sha256, x-shopify-topic',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get webhook headers
    const webhookId = req.headers.get('x-shopify-webhook-id');
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const topic = req.headers.get('x-shopify-topic');
    const shopifyDomain = req.headers.get('x-shopify-shop-domain');

    if (!webhookId || !topic) {
      return new Response(JSON.stringify({ error: 'Missing required webhook headers' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for duplicate webhook (idempotency) using webhook_id
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('webhook_id', webhookId)
      .single();

    if (existingEvent) {
      console.log(`shopify-webhook: Duplicate webhook ignored - ${webhookId}`);
      return new Response(JSON.stringify({ message: 'Webhook already processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // TODO: Add HMAC verification here
    // const hmacSecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
    // if (hmacSecret && hmacHeader) {
    //   const expectedHmac = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body + hmacSecret));
    //   if (hmacHeader !== btoa(String.fromCharCode(...new Uint8Array(expectedHmac)))) {
    //     return new Response('Unauthorized: Invalid HMAC', { status: 401, headers: corsHeaders });
    //   }
    // }

    const body = await req.text();
    const payload = JSON.parse(body);

    console.log(`shopify-webhook: Processing ${topic} from ${shopifyDomain}`);

    // Store webhook event for idempotency (after HMAC check)
    await supabase
      .from('webhook_events')
      .insert({
        webhook_id: webhookId,
        event_type: topic,
        payload: payload
      });

    console.log(`Processing webhook: ${topic} from ${shopifyDomain}`);

    // Handle different webhook types
    switch (topic) {
      case 'products/delete':
        await handleProductDelete(supabase, payload, shopifyDomain);
        break;
      
      case 'product_listings/remove':
        await handleProductListingRemove(supabase, payload, shopifyDomain);
        break;
      
      case 'orders/paid':
      case 'orders/fulfilled':
        await handleOrderUpdate(supabase, payload, shopifyDomain);
        break;
      
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return new Response(JSON.stringify({ message: 'Webhook processed successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleProductDelete(supabase: any, payload: any, shopifyDomain: string | null) {
  const productId = payload.id?.toString();
  if (!productId) return;

  console.log(`Handling product delete: ${productId}`);

  // Find store key from domain
  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) {
    console.warn(`Could not determine store key for domain: ${shopifyDomain}`);
    return;
  }

  // Mark matching items as removed
  const { error } = await supabase
    .from('intake_items')
    .update({
      shopify_removed_at: new Date().toISOString(),
      shopify_removal_mode: 'webhook_product_delete',
      shopify_product_id: null,
      shopify_sync_status: 'synced'
    })
    .eq('store_key', storeKey)
    .eq('shopify_product_id', productId);

  if (error) {
    console.error('Failed to update items for deleted product:', error);
  } else {
    console.log(`Updated items for deleted product ${productId}`);
  }
}

async function handleProductListingRemove(supabase: any, payload: any, shopifyDomain: string | null) {
  const productId = payload.product_id?.toString();
  if (!productId) return;

  console.log(`Handling product listing remove: ${productId}`);

  // Find store key from domain
  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  // Mark items as unpublished (but not deleted)
  const { error } = await supabase
    .from('intake_items')
    .update({
      shopify_removal_mode: 'webhook_unpublished',
      shopify_sync_status: 'synced'
    })
    .eq('store_key', storeKey)
    .eq('shopify_product_id', productId);

  if (error) {
    console.error('Failed to update items for unpublished product:', error);
  }
}

async function handleOrderUpdate(supabase: any, payload: any, shopifyDomain: string | null) {
  const orderId = payload.id?.toString();
  const lineItems = payload.line_items || [];

  if (!orderId || lineItems.length === 0) return;

  console.log(`Handling order update: ${orderId} with ${lineItems.length} line items`);

  // Find store key from domain
  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  for (const lineItem of lineItems) {
    const sku = lineItem.sku;
    const variantId = lineItem.variant_id?.toString();
    const quantity = lineItem.quantity || 0;
    const price = lineItem.price;

    if (!sku && !variantId) continue;

    // Find matching items by SKU or variant ID
    let query = supabase
      .from('intake_items')
      .select('id, quantity, type')
      .eq('store_key', storeKey);

    if (sku) {
      query = query.eq('sku', sku);
    } else if (variantId) {
      query = query.eq('shopify_variant_id', variantId);
    }

    const { data: items, error } = await query;

    if (error || !items?.length) {
      console.warn(`No items found for SKU: ${sku}, variant: ${variantId}`);
      continue;
    }

    for (const item of items) {
      // For graded items, set quantity to 0 and record sale
      if (item.type === 'Graded') {
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: 0,
            sold_at: new Date().toISOString(),
            sold_price: price,
            sold_order_id: orderId,
            sold_channel: 'shopify',
            sold_currency: payload.currency || 'USD'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to update sold item:', updateError);
        } else {
          console.log(`Marked graded item ${item.id} as sold`);
        }
      } else {
        // For raw items, decrement quantity
        const newQuantity = Math.max(0, (item.quantity || 0) - quantity);
        
        const updateData: any = { quantity: newQuantity };
        
        // If quantity goes to 0, record sale info
        if (newQuantity === 0) {
          updateData.sold_at = new Date().toISOString();
          updateData.sold_price = price;
          updateData.sold_order_id = orderId;
          updateData.sold_channel = 'shopify';
          updateData.sold_currency = payload.currency || 'USD';
        }

        const { error: updateError } = await supabase
          .from('intake_items')
          .update(updateData)
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to update raw item quantity:', updateError);
        } else {
          console.log(`Updated raw item ${item.id} quantity to ${newQuantity}`);
        }
      }
    }
  }
}

async function getStoreKeyFromDomain(supabase: any, shopifyDomain: string | null): Promise<string | null> {
  if (!shopifyDomain) return null;

  // Try to find store key by checking system settings for matching domain
  const { data: settings } = await supabase
    .from('system_settings')
    .select('key_name, key_value')
    .like('key_name', 'SHOPIFY_%_DOMAIN');

  if (settings) {
    for (const setting of settings) {
      if (setting.key_value === shopifyDomain) {
        // Extract store key from setting name
        // Format: SHOPIFY_{STORE_KEY}_DOMAIN
        const match = setting.key_name.match(/SHOPIFY_(.+)_DOMAIN/);
        if (match) {
          return match[1].toLowerCase();
        }
      }
    }
  }

  // Fallback: extract from domain (e.g., mystore.myshopify.com -> mystore)
  const domainMatch = shopifyDomain.match(/^([^.]+)\.myshopify\.com/);
  return domainMatch ? domainMatch[1] : null;
}