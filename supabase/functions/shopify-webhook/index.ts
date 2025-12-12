import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import JsBarcode from 'https://esm.sh/jsbarcode@3.11.6';

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

    // HMAC verification for webhook security
    // Fetch webhook secret from database based on store
    const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
    let hmacSecret: string | null = null;
    
    if (storeKey) {
      // Normalize store key: remove '_store' suffix if present and uppercase
      // e.g., 'hawaii_store' -> 'HAWAII', 'las_vegas' -> 'LAS_VEGAS'
      const normalizedKey = storeKey.replace(/_store$/i, '').toUpperCase();
      const secretKey = `SHOPIFY_${normalizedKey}_WEBHOOK_SECRET`;
      const { data: secretData } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', secretKey)
        .single();
      
      hmacSecret = secretData?.key_value || null;
      console.log(`[SECURITY] Looking up webhook secret for store: ${storeKey} (normalized: ${normalizedKey}), found: ${!!hmacSecret}`);
    } else {
      console.warn('[SECURITY] Could not determine store key from domain:', shopifyDomain);
    }
    
    let body = '';
    let payload = {};
    
    // Read the body first
    body = await req.text();
    
    // Verify HMAC if secret is configured
    if (hmacSecret && hmacHeader) {
      const isValid = await verifyHMAC(body, hmacHeader, hmacSecret);
      
      if (!isValid) {
        console.warn('[SECURITY] Invalid HMAC signature detected', {
          webhookId,
          topic,
          shopifyDomain,
          storeKey
        });
        
        // Log the failed attempt
        await supabase
          .from('system_logs')
          .insert({
            level: 'warn',
            message: 'Shopify webhook HMAC validation failed',
            context: {
              webhook_id: webhookId,
              topic,
              domain: shopifyDomain,
              store_key: storeKey
            }
          });
        
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('[SECURITY] HMAC signature verified successfully for store:', storeKey);
    } else if (hmacSecret) {
      // Secret configured but no HMAC header provided
      console.warn('[SECURITY] HMAC secret configured but no signature provided');
      return new Response(JSON.stringify({ error: 'Missing webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (hmacHeader) {
      // HMAC header provided but no secret configured for this store
      console.warn('[SECURITY] Webhook signature provided but no secret configured for store:', storeKey);
    }
    
    payload = JSON.parse(body);

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
      
      case 'orders/create':
        // Send Discord notification for new orders
        await sendDiscordNotification(supabase, payload);
        await handleOrderUpdate(supabase, payload, shopifyDomain);
        break;
      
      case 'orders/updated':
      case 'orders/fulfilled':
        await handleOrderUpdate(supabase, payload, shopifyDomain);
        break;
      
      case 'inventory_levels/update':
      case 'inventory_items/update':  // Shopify also sends this topic
        await handleInventoryLevelUpdate(supabase, payload, shopifyDomain);
        break;
      
      case 'orders/cancelled':
        await handleOrderCancellation(supabase, payload, shopifyDomain);
        break;
      
      case 'refunds/create':
        await handleRefundCreated(supabase, payload, shopifyDomain);
        break;
      
      case 'products/update':
        await handleProductUpdate(supabase, payload, shopifyDomain);
        break;
      
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return new Response(JSON.stringify({ message: 'Webhook processed successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
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

function isOpenNowInHawaii(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  return hour >= 9 && hour < 19;
}

function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  
  if (typeof tags === 'string') {
    return tags.toLowerCase().split(',').map((t) => t.trim()).includes('ebay');
  }
  
  if (Array.isArray(tags)) {
    return tags.some((tag) => tag.toString().toLowerCase().trim() === 'ebay');
  }
  
  return false;
}

function renderMessage(template: string, payload: any, roleId: string, mentionEnabled: boolean): string {
  let message = template;

  message = message.replace(/{id}/g, payload.id || payload.order_number || '');
  message = message.replace(/{customer_name}/g, payload.customer?.first_name || payload.billing_address?.first_name || 'N/A');
  message = message.replace(/{total}/g, payload.total_price || payload.current_total_price || '');
  message = message.replace(/{created_at}/g, payload.created_at || '');
  message = message.replace(/{tags}/g, JSON.stringify(payload.tags || []));
  
  const rawJson = JSON.stringify(payload, null, 2);
  message = message.replace(/{raw_json}/g, rawJson.substring(0, 1800) + (rawJson.length > 1800 ? '...' : ''));
  
  message = message.replace(/{role_id}/g, roleId);

  if (!mentionEnabled) {
    message = message.split('\n').filter((line) => !line.includes('<@&')).join('\n');
  }

  return message;
}

async function sendDiscordNotification(supabase: any, payload: any) {
  try {
    console.log('Checking Discord notification for order:', payload.id, payload.tags);
    
    if (!hasEbayTag(payload.tags)) {
      console.log('Not an eBay order, skipping Discord notification');
      return;
    }

    const { data: settings, error: configError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['discord.webhooks', 'discord.mention', 'discord.templates']);

    if (configError) {
      console.error('Failed to load Discord config:', configError);
      return;
    }

    const config = {
      webhooks: settings?.find((s) => s.key === 'discord.webhooks')?.value || { channels: [], immediate_channel: '', queued_channel: '' },
      mention: settings?.find((s) => s.key === 'discord.mention')?.value || { enabled: false, role_id: '' },
      templates: settings?.find((s) => s.key === 'discord.templates')?.value || { immediate: '', queued: '' },
    };

    const isOpen = isOpenNowInHawaii();
    console.log('Business hours check:', isOpen ? 'OPEN' : 'CLOSED');

    if (isOpen) {
      const immediateChannel = config.webhooks.channels.find((ch: any) => ch.name === config.webhooks.immediate_channel);
      
      if (!immediateChannel || !immediateChannel.webhook_url) {
        console.warn('No immediate channel webhook configured');
        return;
      }

      const message = renderMessage(config.templates.immediate, payload, config.mention.role_id, config.mention.enabled);

      let barcodeSvg: string | null = null;
      try {
        const orderId = payload.id?.toString() || payload.order_number?.toString() || 'NO-ID';
        const svg = JsBarcode(orderId, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          xmlDocument: true,
        });
        barcodeSvg = svg;
      } catch (error) {
        console.warn('Failed to generate barcode:', error);
      }

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify({
        content: message,
        allowed_mentions: { parse: ['roles'] },
      }));

      if (barcodeSvg) {
        const svgBlob = new Blob([barcodeSvg], { type: 'image/svg+xml' });
        formData.append('files[0]', svgBlob, 'barcode.svg');
      }

      const discordResponse = await fetch(immediateChannel.webhook_url, {
        method: 'POST',
        body: formData,
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord API error:', discordResponse.status, errorText);
        await supabase.from('pending_notifications').insert({ payload });
      } else {
        console.log('Sent Discord notification immediately');
      }
    } else {
      const { data: existing } = await supabase
        .from('pending_notifications')
        .select('id')
        .eq('sent', false)
        .contains('payload', { id: payload.id })
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('pending_notifications').insert({ payload });
        console.log('Queued Discord notification for next business hours');
      } else {
        console.log('Order already queued');
      }
    }
  } catch (error) {
    console.error('Discord notification error:', error);
  }
}

async function handleOrderUpdate(supabase: any, payload: any, shopifyDomain: string | null) {
  const orderId = payload.id?.toString();
  const lineItems = payload.line_items || [];
  const financialStatus = payload.financial_status;

  if (!orderId || lineItems.length === 0) return;

  // Only process paid orders to prevent premature inventory deduction
  if (financialStatus !== 'paid' && financialStatus !== 'partially_paid') {
    console.log(`Skipping order ${orderId} - not paid yet (status: ${financialStatus})`);
    return;
  }

  console.log(`Handling order update: ${orderId} with ${lineItems.length} line items`);

  // Find store key from domain
  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  // Get Shopify credentials for inventory sync back
  const storeUpper = storeKey.toUpperCase();
  const { data: domainSetting } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
    .single();
  
  const { data: tokenSetting } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
    .single();
  
  const domain = domainSetting?.key_value;
  const token = tokenSetting?.key_value;

  for (const lineItem of lineItems) {
    const sku = lineItem.sku;
    const variantId = lineItem.variant_id?.toString();
    const quantity = lineItem.quantity || 0;
    const price = lineItem.price;
    
    // Extract location from line item
    const locationId = lineItem.location_id?.toString();
    const locationGid = locationId ? `gid://shopify/Location/${locationId}` : null;

    if (!sku && !variantId) continue;

    // Find matching items by SKU or variant ID with location validation
    let query = supabase
      .from('intake_items')
      .select('id, quantity, type, shopify_inventory_item_id, shopify_location_gid')
      .eq('store_key', storeKey);

    if (sku) {
      query = query.eq('sku', sku);
    } else if (variantId) {
      query = query.eq('shopify_variant_id', variantId);
    }
    
    // Add location validation if available
    if (locationGid) {
      query = query.eq('shopify_location_gid', locationGid);
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
            sold_currency: payload.currency || 'USD',
            updated_by: 'shopify_webhook'
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
        
        const updateData: any = { 
          quantity: newQuantity,
          updated_by: 'shopify_webhook'
        };
        
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
          
          // Sync updated quantity back to Shopify (Phase 3: Inventory Sync Back)
          if (item.type === 'Raw' && newQuantity > 0 && domain && token && item.shopify_inventory_item_id && item.shopify_location_gid) {
            const shopifyLocationId = item.shopify_location_gid.replace('gid://shopify/Location/', '');
            
            const syncResponse = await fetch(
              `https://${domain}/admin/api/2024-07/inventory_levels/set.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': token,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  location_id: shopifyLocationId,
                  inventory_item_id: item.shopify_inventory_item_id,
                  available: newQuantity
                })
              }
            );
            
            if (!syncResponse.ok) {
              console.error('Failed to sync inventory back to Shopify:', await syncResponse.text());
            } else {
              console.log(`✓ Synced inventory back to Shopify: ${sku} → ${newQuantity}`);
            }
          }
        }
      }
    }
  }
}

async function handleInventoryLevelUpdate(supabase: any, payload: any, shopifyDomain: string | null) {
  const inventoryItemId = payload.inventory_item_id?.toString();
  const available = payload.available;
  const locationId = payload.location_id?.toString();
  const locationGid = locationId ? `gid://shopify/Location/${locationId}` : null;
  
  if (!inventoryItemId || available === undefined) return;

  console.log(`Handling inventory level update: item ${inventoryItemId}, new quantity: ${available}, location: ${locationGid}`);

  // Find store key from domain
  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  // Phase 2: Add location validation to query
  // Find matching items by Shopify inventory item ID with location context
  let query = supabase
    .from('intake_items')
    .select('id, quantity, sku, type, shopify_product_id, shopify_variant_id')
    .eq('store_key', storeKey)
    .or(`shopify_inventory_item_id.eq.${inventoryItemId},shopify_variant_id.eq.${inventoryItemId}`);
  
  // Add location validation if available
  if (locationGid) {
    query = query.eq('shopify_location_gid', locationGid);
  }

  const { data: items, error } = await query;

  if (error || !items?.length) {
    // Phase 4: Improved fallback matching - only with location context
    if (!locationGid) {
      console.error('Cannot fallback without location context');
      return;
    }
    
    console.warn(`No direct match for inventory item ${inventoryItemId} at location ${locationGid}`);
    
    // Try matching by variant ID as last resort (with location)
    const { data: variantItems } = await supabase
      .from('intake_items')
      .select('id, quantity, sku, type, shopify_product_id, shopify_variant_id')
      .eq('store_key', storeKey)
      .eq('shopify_location_gid', locationGid)
      .not('shopify_variant_id', 'is', null);
      
    if (!variantItems?.length) {
      console.warn('No variants found for fallback matching');
      return;
    }
    
    // Only update items at this specific location
    console.log(`Fallback: updating ${variantItems.length} items at location ${locationGid}`);
    for (const item of variantItems) {
      await updateItemQuantity(supabase, item, available);
    }
    return;
  }

  // Update matching items
  console.log(`Found ${items.length} exact matches for inventory item ${inventoryItemId}`);
  for (const item of items) {
    await updateItemQuantity(supabase, item, available);
  }
}

async function handleOrderCancellation(supabase: any, payload: any, shopifyDomain: string | null) {
  const orderId = payload.id?.toString();
  const lineItems = payload.line_items || [];

  if (!orderId || lineItems.length === 0) return;

  console.log(`Handling order cancellation: ${orderId} with ${lineItems.length} line items`);

  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  for (const lineItem of lineItems) {
    const sku = lineItem.sku;
    const quantity = lineItem.quantity || 0;

    if (!sku) continue;

    // Find items that were sold in this order
    const { data: items, error } = await supabase
      .from('intake_items')
      .select('id, quantity, type, sold_at')
      .eq('store_key', storeKey)
      .eq('sku', sku)
      .eq('sold_order_id', orderId);

    if (error || !items?.length) continue;

    for (const item of items) {
      // Restore inventory for cancelled items
      if (item.type === 'Graded') {
        // For graded items, restore to quantity 1
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: 1,
            sold_at: null,
            sold_price: null,
            sold_order_id: null,
            sold_channel: null,
            updated_by: 'shopify_webhook'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore graded item:', updateError);
        } else {
          console.log(`Restored graded item ${item.id} from cancellation`);
        }
      } else {
        // For raw items, add back the cancelled quantity
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: (item.quantity || 0) + quantity,
            updated_by: 'shopify_webhook'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore raw item quantity:', updateError);
        } else {
          console.log(`Restored raw item ${item.id} quantity by ${quantity}`);
        }
      }
    }
  }
}

async function handleRefundCreated(supabase: any, payload: any, shopifyDomain: string | null) {
  const orderId = payload.order_id?.toString();
  const refundLineItems = payload.refund_line_items || [];

  if (!orderId || refundLineItems.length === 0) return;

  console.log(`Handling refund for order: ${orderId} with ${refundLineItems.length} line items`);

  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  for (const refundItem of refundLineItems) {
    const lineItem = refundItem.line_item;
    const sku = lineItem?.sku;
    const refundQuantity = refundItem.quantity || 0;

    if (!sku) continue;

    // Find items that were sold in this order
    const { data: items, error } = await supabase
      .from('intake_items')
      .select('id, quantity, type')
      .eq('store_key', storeKey)
      .eq('sku', sku)
      .eq('sold_order_id', orderId);

    if (error || !items?.length) continue;

    for (const item of items) {
      if (item.type === 'Graded') {
        // For graded items, restore to available
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: 1,
            sold_at: null,
            sold_price: null,
            updated_by: 'shopify_webhook'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore refunded graded item:', updateError);
        } else {
          console.log(`Restored graded item ${item.id} from refund`);
        }
      } else {
        // For raw items, add back refunded quantity
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: (item.quantity || 0) + refundQuantity,
            updated_by: 'shopify_webhook'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore refunded raw item:', updateError);
        } else {
          console.log(`Restored raw item ${item.id} quantity by ${refundQuantity}`);
        }
      }
    }
  }
}

async function handleProductUpdate(supabase: any, payload: any, shopifyDomain: string | null) {
  const productId = payload.id?.toString();
  const variants = payload.variants || [];

  if (!productId) return;

  console.log(`Handling product update: ${productId} with ${variants.length} variants`);

  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  for (const variant of variants) {
    const sku = variant.sku;
    const price = variant.price;
    const title = payload.title;

    if (!sku) continue;

    // Update matching items with new price/title
    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        price: parseFloat(price),
        subject: title, // Update title if needed
        updated_by: 'shopify_webhook'
      })
      .eq('store_key', storeKey)
      .eq('sku', sku)
      .eq('shopify_product_id', productId);

    if (updateError) {
      console.error(`Failed to update item for SKU ${sku}:`, updateError);
    } else {
      console.log(`Updated item pricing for SKU ${sku}: $${price}`);
    }
  }
}

/**
 * Verify Shopify webhook HMAC signature using constant-time comparison
 * Prevents timing attacks by using crypto.subtle.timingSafeEqual
 */
async function verifyHMAC(body: string, hmacHeader: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body)
    );
    
    // Convert signature to base64
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    // Use constant-time comparison to prevent timing attacks
    const providedSignature = encoder.encode(hmacHeader);
    const computedSignature = encoder.encode(signatureBase64);
    
    // Ensure both signatures are the same length
    if (providedSignature.length !== computedSignature.length) {
      return false;
    }
    
    // Constant-time comparison
    let matches = true;
    for (let i = 0; i < providedSignature.length; i++) {
      if (providedSignature[i] !== computedSignature[i]) {
        matches = false;
      }
    }
    
    return matches;
  } catch (error) {
    console.error('[SECURITY] HMAC verification error:', error);
    return false;
  }
}

async function updateItemQuantity(supabase: any, item: any, newQuantity: number) {
  const updateData: any = { 
    quantity: Math.max(0, newQuantity),
    updated_by: 'shopify_webhook',
    updated_at: new Date().toISOString()
  };
  
  // If quantity goes to 0, mark as sold via inventory adjustment
  if (newQuantity === 0 && item.quantity > 0) {
    updateData.sold_at = new Date().toISOString();
    updateData.sold_channel = 'shopify_inventory_adjustment';
    updateData.sold_currency = 'USD';
  }

  const { error: updateError } = await supabase
    .from('intake_items')
    .update(updateData)
    .eq('id', item.id);

  if (updateError) {
    console.error(`Failed to update item ${item.id} quantity:`, updateError);
  } else {
    console.log(`Updated item ${item.id} (SKU: ${item.sku}) quantity from ${item.quantity} to ${newQuantity}`);
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