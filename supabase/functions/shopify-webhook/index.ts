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

    // Extract location_gid from payload if available (for inventory webhooks)
    let locationGid: string | null = null;
    if (payload.location_id) {
      locationGid = `gid://shopify/Location/${payload.location_id}`;
    }

    // Store webhook event for idempotency (after HMAC check)
    // Include store_key and location_gid for faster querying
    const { data: insertedEvent, error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        webhook_id: webhookId,
        event_type: topic,
        payload: payload,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        store_key: storeKey,
        location_gid: locationGid
      })
      .select('id')
      .single();
    
    const eventId = insertedEvent?.id;
    if (insertError) {
      console.error('Failed to insert webhook event:', insertError);
    }

    console.log(`Processing webhook: ${topic} from ${shopifyDomain} (event_id: ${eventId})`);


    let processingError: Error | null = null;

    try {
      // Handle different webhook types
      switch (topic) {
        case 'products/delete':
          await handleProductDelete(supabase, payload, shopifyDomain);
          break;
        
        case 'product_listings/remove':
          await handleProductListingRemove(supabase, payload, shopifyDomain);
          break;
        
        case 'orders/create':
          // Send Discord notification for new orders (all online orders, not just eBay)
          await sendDiscordNotification(supabase, payload, shopifyDomain);
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
    } catch (handlerError) {
      processingError = handlerError instanceof Error ? handlerError : new Error(String(handlerError));
      console.error(`Handler error for ${topic}:`, processingError.message);
    }

    // Update event status based on outcome
    if (eventId) {
      if (processingError) {
        // Mark as failed, increment retry count
        const { data: currentEvent } = await supabase
          .from('webhook_events')
          .select('retry_count, max_retries')
          .eq('id', eventId)
          .single();
        
        const retryCount = (currentEvent?.retry_count || 0) + 1;
        const maxRetries = currentEvent?.max_retries || 5;
        const isDeadLetter = retryCount >= maxRetries;

        await supabase
          .from('webhook_events')
          .update({
            status: isDeadLetter ? 'dead_letter' : 'failed',
            error_message: processingError.message,
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            dead_letter: isDeadLetter,
            processing_completed_at: new Date().toISOString()
          })
          .eq('id', eventId);

        if (isDeadLetter) {
          console.error(`[DEAD_LETTER] Event ${eventId} exceeded max retries (${maxRetries})`);
        }
      } else {
        // Mark as processed successfully
        await supabase
          .from('webhook_events')
          .update({
            status: 'processed',
            processing_completed_at: new Date().toISOString()
          })
          .eq('id', eventId);
      }
    }

    // Track webhook health for Sync Health dashboard
    // This is a lightweight upsert to track last received webhook per store/location/topic
    if (storeKey) {
      try {
        await supabase
          .from('webhook_health')
          .upsert({
            store_key: storeKey,
            location_gid: locationGid,
            topic: topic,
            last_received_at: new Date().toISOString(),
            last_webhook_id: webhookId,
            event_count: 1,
            last_error: processingError?.message || null,
            last_error_at: processingError ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'store_key,location_gid,topic'
          });
      } catch (healthError) {
        // Don't fail the webhook for health tracking errors
        console.warn('Failed to update webhook_health:', healthError);
      }
    }

    // Always return 200 to Shopify to prevent unnecessary retries from their side
    // We handle our own retry logic internally
    return new Response(JSON.stringify({ 
      message: processingError ? 'Webhook failed - queued for retry' : 'Webhook processed successfully',
      event_id: eventId
    }), {
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

// Check if store is open based on region business hours
async function isStoreOpenForRegion(supabase: any, regionId: string): Promise<boolean> {
  try {
    // Fetch business hours from region_settings
    const { data: settings } = await supabase
      .from('region_settings')
      .select('setting_value')
      .eq('region_id', regionId)
      .eq('setting_key', 'operations.business_hours')
      .single();
    
    const businessHours = settings?.setting_value || {
      start: regionId === 'hawaii' ? 9 : 10,
      end: regionId === 'hawaii' ? 19 : 20,
      timezone: regionId === 'hawaii' ? 'Pacific/Honolulu' : 'America/Los_Angeles',
    };

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: businessHours.timezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(new Date());
    
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const day = parts.find((p) => p.type === 'weekday')?.value;
    
    // Closed on Sundays
    if (day === 'Sun') return false;
    
    return hour >= businessHours.start && hour < businessHours.end;
  } catch (error) {
    console.error('Error checking store hours:', error);
    // Fallback to Hawaii hours
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Honolulu',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    return hour >= 9 && hour < 19;
  }
}

// Get region-specific Discord configuration
async function getRegionDiscordConfig(supabase: any, regionId: string) {
  try {
    const { data: settings } = await supabase
      .from('region_settings')
      .select('setting_key, setting_value')
      .eq('region_id', regionId)
      .like('setting_key', 'discord.%');
    
    if (!settings || settings.length === 0) {
      return null;
    }
    
    return {
      webhookUrl: settings.find((s: any) => s.setting_key === 'discord.webhook_url')?.setting_value,
      channelName: settings.find((s: any) => s.setting_key === 'discord.channel_name')?.setting_value,
      roleId: settings.find((s: any) => s.setting_key === 'discord.role_id')?.setting_value,
      enabled: settings.find((s: any) => s.setting_key === 'discord.enabled')?.setting_value !== false,
    };
  } catch (error) {
    console.error('Error fetching region Discord config:', error);
    return null;
  }
}

// Determine region from order payload (fulfillment location or tags)
function getOrderRegion(payload: any): string {
  // Check fulfillment location
  const fulfillmentLocation = payload.fulfillment_location_name || payload.location_name || '';
  if (fulfillmentLocation.toLowerCase().includes('vegas') || fulfillmentLocation.toLowerCase().includes('las vegas')) {
    return 'las_vegas';
  }
  
  // Check tags for region
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags : tags.join(',');
  if (tagString.toLowerCase().includes('vegas') || tagString.toLowerCase().includes('las_vegas')) {
    return 'las_vegas';
  }
  
  // Default to Hawaii
  return 'hawaii';
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

/**
 * Determines if an order is an online order that needs fulfillment (shipping or pickup).
 * Excludes POS orders as they are handled in-store.
 */
function isOnlineOrderNeedingFulfillment(payload: any): boolean {
  const sourceName = payload.source_name || '';
  
  // Skip POS orders - they are handled in-store and don't need notifications
  if (sourceName === 'pos' || sourceName === 'shopify_pos' || sourceName === 'POS') {
    return false;
  }
  
  // Check if already fulfilled
  const fulfillmentStatus = payload.fulfillment_status;
  if (fulfillmentStatus === 'fulfilled') {
    return false;
  }
  
  // Check if order has shipping lines (needs to be shipped)
  const shippingLines = payload.shipping_lines || [];
  const hasShipping = shippingLines.length > 0;
  
  // Check if order has a shipping address (indicates shipping required)
  const hasShippingAddress = payload.shipping_address != null;
  
  // Check for pickup indicators
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const hasPickupTag = tagString.includes('pickup') || tagString.includes('local_pickup') || tagString.includes('store_pickup');
  
  // Check fulfillments for pickup method
  const fulfillments = payload.fulfillments || [];
  const hasPickupFulfillment = fulfillments.some((f: any) => 
    f.service === 'local_pickup' || 
    f.delivery_type === 'pickup' ||
    (f.name || '').toLowerCase().includes('pickup')
  );
  
  // Check line items for items requiring shipping
  const lineItems = payload.line_items || [];
  const hasItemsRequiringShipping = lineItems.some((item: any) => item.requires_shipping !== false);
  
  // Order needs notification if it has shipping OR is for pickup
  return hasShipping || hasShippingAddress || hasPickupTag || hasPickupFulfillment || hasItemsRequiringShipping;
}

/**
 * Determines the order type for Discord notification formatting.
 */
function getOrderType(payload: any): 'shipping' | 'pickup' | 'ebay' {
  // Check for eBay tag first (highest priority)
  if (hasEbayTag(payload.tags)) {
    return 'ebay';
  }
  
  // Check for pickup indicators
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const hasPickupTag = tagString.includes('pickup') || tagString.includes('local_pickup') || tagString.includes('store_pickup');
  
  const fulfillments = payload.fulfillments || [];
  const hasPickupFulfillment = fulfillments.some((f: any) => 
    f.service === 'local_pickup' || 
    f.delivery_type === 'pickup' ||
    (f.name || '').toLowerCase().includes('pickup')
  );
  
  if (hasPickupTag || hasPickupFulfillment) {
    return 'pickup';
  }
  
  return 'shipping';
}

/**
 * Determines the order source platform (eBay, Shopify, Draft Order, etc.)
 */
function getOrderSource(payload: any): { emoji: string; label: string } {
  const sourceName = payload?.source_name?.toLowerCase() || '';
  const tags = payload?.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const paymentGateways = payload?.payment_gateway_names || [];
  const hasEbayGateway = paymentGateways.some((g: string) => g?.toUpperCase() === 'EBAY');
  
  // eBay detection: source_name, tags, or payment gateway
  if (sourceName === 'ebay' || tagString.includes('ebay') || hasEbayGateway) {
    return { emoji: '🏷️', label: 'eBay' };
  }
  
  // Shopify website orders
  if (sourceName === 'web' || sourceName === 'online_store' || sourceName === 'shopify') {
    return { emoji: '🛒', label: 'Shopify Website' };
  }
  
  // Draft orders (manually created)
  if (sourceName === 'shopify_draft_order' || sourceName === 'draft_order') {
    return { emoji: '📝', label: 'Draft Order' };
  }
  
  // POS orders (shouldn't typically appear in notifications, but handle anyway)
  if (sourceName === 'pos' || sourceName === 'shopify_pos') {
    return { emoji: '🏪', label: 'In-Store POS' };
  }
  
  // Default fallback
  return { emoji: '🛍️', label: 'Online' };
}

/**
 * Determines region from order payload using shop domain, fulfillment location, or tags.
 */
function getOrderRegionFromPayload(payload: any, shopDomain: string | null): string {
  // 1. Check shop_domain from webhook header (most reliable)
  if (shopDomain) {
    const domain = shopDomain.toLowerCase();
    if (domain.includes('aloha-card-shop') || domain.includes('hawaii')) {
      return 'hawaii';
    }
    if (domain.includes('vqvxdi-ar') || domain.includes('vegas')) {
      return 'las_vegas';
    }
  }
  
  // 2. Check fulfillment location name in order
  const fulfillmentLocation = payload.fulfillment_location_name || payload.location_name || '';
  const locationLower = fulfillmentLocation.toLowerCase();
  if (locationLower.includes('vegas') || locationLower.includes('las vegas') || locationLower.includes('702')) {
    return 'las_vegas';
  }
  if (locationLower.includes('hawaii') || locationLower.includes('honolulu')) {
    return 'hawaii';
  }
  
  // 3. Check order tags
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  if (tagString.includes('las_vegas') || tagString.includes('vegas')) {
    return 'las_vegas';
  }
  if (tagString.includes('hawaii')) {
    return 'hawaii';
  }
  
  // 4. Check assigned_location_id on line items
  const lineItems = payload.line_items || [];
  for (const item of lineItems) {
    const assignedLocation = item.origin_location?.name || item.location_name || '';
    if (assignedLocation.toLowerCase().includes('vegas')) {
      return 'las_vegas';
    }
    if (assignedLocation.toLowerCase().includes('hawaii')) {
      return 'hawaii';
    }
  }
  
  // 5. Default to Hawaii
  return 'hawaii';
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

async function sendDiscordNotification(supabase: any, payload: any, shopifyDomain: string | null = null) {
  try {
    console.log('Checking Discord notification for order:', payload.id, 'source:', payload.source_name, 'tags:', payload.tags);
    
    // NEW: Check if this is an online order that needs fulfillment (replaces eBay-only filter)
    if (!isOnlineOrderNeedingFulfillment(payload)) {
      console.log('Order does not require fulfillment notification (POS or already fulfilled)');
      return;
    }

    // Determine region from order (now uses shop domain for better accuracy)
    const regionId = getOrderRegionFromPayload(payload, shopifyDomain);
    const orderType = getOrderType(payload);
    console.log(`Order region: ${regionId}, type: ${orderType}`);

    // Try region-specific Discord config first
    const regionConfig = await getRegionDiscordConfig(supabase, regionId);
    
    // Check if store is open for this region
    const isOpen = await isStoreOpenForRegion(supabase, regionId);
    console.log(`Business hours check for ${regionId}:`, isOpen ? 'OPEN' : 'CLOSED');

    // Fall back to global app_settings if no region config
    const { data: settings, error: configError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['discord.webhooks', 'discord.mention', 'discord.templates']);

    if (configError) {
      console.error('Failed to load Discord config:', configError);
      return;
    }

    const config = {
      webhooks: settings?.find((s: any) => s.key === 'discord.webhooks')?.value || { channels: [], immediate_channel: '', queued_channel: '' },
      mention: settings?.find((s: any) => s.key === 'discord.mention')?.value || { enabled: false, role_id: '' },
      templates: settings?.find((s: any) => s.key === 'discord.templates')?.value || { immediate: '', queued: '' },
    };

    // Determine which webhook to use: region-specific or fallback to global
    let webhookUrl: string | null = null;
    let roleId = config.mention.role_id;
    let mentionEnabled = config.mention.enabled;

    if (regionConfig?.enabled && regionConfig.webhookUrl) {
      webhookUrl = regionConfig.webhookUrl;
      roleId = regionConfig.roleId || roleId;
      console.log(`Using region-specific Discord config for ${regionId}`);
    } else {
      // Use global config
      const channelName = isOpen ? config.webhooks.immediate_channel : config.webhooks.queued_channel;
      const channel = config.webhooks.channels.find((ch: any) => ch.name === channelName);
      webhookUrl = channel?.webhook_url || null;
    }

    if (isOpen) {
      if (!webhookUrl) {
        console.warn('No webhook URL configured for immediate notification');
        return;
      }

      // Add order type badge, source, and region indicator to message
      const regionIcon = regionId === 'hawaii' ? '🌺' : '🎰';
      const regionLabel = regionId === 'hawaii' ? 'Hawaii' : 'Las Vegas';
      const orderTypeBadge = orderType === 'ebay' ? '🏷️ **eBay ORDER**' 
                          : orderType === 'pickup' ? '📦 **PICKUP ORDER**' 
                          : '🛍️ **ONLINE ORDER**';
      const source = getOrderSource(payload);
      const sourceLine = `🔗 **Source:** ${source.emoji} ${source.label}`;
      const message = `${regionIcon} **${regionLabel}** | ${orderTypeBadge}\n${sourceLine}\n` + renderMessage(config.templates.immediate, payload, roleId, mentionEnabled);

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

      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord API error:', discordResponse.status, errorText);
        await supabase.from('pending_notifications').insert({ 
          payload,
          region_id: regionId 
        });
      } else {
        console.log(`Sent Discord notification immediately to ${regionId} channel`);
      }
    } else {
      const { data: existing } = await supabase
        .from('pending_notifications')
        .select('id')
        .eq('sent', false)
        .contains('payload', { id: payload.id })
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('pending_notifications').insert({ 
          payload,
          region_id: regionId 
        });
        console.log(`Queued Discord notification for ${regionId} next business hours`);
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
      // For graded items (1-of-1), use atomic lock via cards table
      if (item.type === 'Graded' && sku) {
        // RUNTIME GUARD: Ensure card exists before atomic lock
        // This auto-creates cards for legacy items not yet in the cards table
        const { data: ensureResult } = await supabase.rpc('ensure_card_exists', {
          p_sku: sku,
          p_source: 'shopify_order_webhook'
        });
        
        if (ensureResult && ensureResult.length > 0 && ensureResult[0].was_created) {
          console.log(`[Shopify Webhook] ⚠️ Auto-created legacy card for SKU ${sku}`);
        }
        
        // Try atomic lock via process-card-sale
        const sourceEventId = `${orderId}_${sku}`;
        
        try {
          const { data: saleResult } = await supabase.rpc('atomic_mark_card_sold', {
            p_sku: sku,
            p_source: 'shopify',
            p_source_event_id: sourceEventId
          });
          
          const result = Array.isArray(saleResult) ? saleResult[0] : saleResult;
          console.log(`[Atomic Lock] SKU ${sku}: ${result?.result || 'unknown'}`);
          
          if (result?.result === 'sold') {
            // Card was successfully locked - update intake_items
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
            
            // End eBay listing if exists
            const { data: card } = await supabase
              .from('cards')
              .select('ebay_offer_id')
              .eq('sku', sku)
              .single();
            
            if (card?.ebay_offer_id) {
              console.log(`[Cross-channel] Ending eBay listing for ${sku}`);
              
              // Try to end eBay listing immediately
              try {
                const ebayResponse = await fetch(
                  `${Deno.env.get('SUPABASE_URL')}/functions/v1/ebay-update-inventory`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      sku,
                      quantity: 0,
                      store_key: storeKey
                    })
                  }
                );
                
                if (!ebayResponse.ok) {
                  console.warn(`[Cross-channel] eBay update failed, queueing for retry`);
                  await supabase.rpc('queue_ebay_end_listing', {
                    p_sku: sku,
                    p_ebay_offer_id: card.ebay_offer_id
                  });
                }
              } catch (ebayError) {
                console.error('[Cross-channel] eBay error:', ebayError);
                await supabase.rpc('queue_ebay_end_listing', {
                  p_sku: sku,
                  p_ebay_offer_id: card.ebay_offer_id
                });
              }
            }
          } else if (result?.result === 'already_sold' || result?.result === 'duplicate_event') {
            console.log(`[Atomic Lock] SKU ${sku} already processed, skipping`);
          } else if (result?.result === 'not_found') {
            // Card not in cards table - fall back to legacy behavior
            console.log(`[Atomic Lock] SKU ${sku} not in cards table, using legacy update`);
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
            }
          }
        } catch (lockError) {
          console.error('[Atomic Lock] Error:', lockError);
          // Fall back to legacy update
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
          }
        }
      } else {
        // For raw items: Shopify is source of truth
        // We receive the order webhook AFTER Shopify has already deducted inventory
        // Just record the sale locally - do NOT write back to Shopify
        const newQuantity = Math.max(0, (item.quantity || 0) - quantity);
        
        const updateData: any = { 
          quantity: newQuantity,
          updated_by: 'shopify_webhook',
          last_shopify_seen_at: new Date().toISOString()
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
          console.log(`[Shopify Truth] Updated raw item ${item.id} quantity to ${newQuantity} (no write-back to Shopify)`);
        }
        
        // NOTE: Removed Shopify inventory_levels/set call here
        // Shopify is source of truth - it already knows the quantity from POS/online sale
        // We only READ from Shopify webhooks, never write back for sale events
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

  // Get store's inventory truth mode
  const { data: storeConfig } = await supabase
    .from('shopify_stores')
    .select('inventory_truth_mode')
    .eq('key', storeKey)
    .single();
  
  const truthMode = storeConfig?.inventory_truth_mode || 'shopify';

  // STEP 1: Upsert into shopify_inventory_levels table (always do this)
  if (locationGid) {
    // Try to get location name from cache for better display
    let locationName: string | null = null;
    
    const { data: cachedLoc } = await supabase
      .from('shopify_location_cache')
      .select('location_name')
      .eq('store_key', storeKey)
      .eq('location_gid', locationGid)
      .maybeSingle();
    
    if (cachedLoc?.location_name) {
      locationName = cachedLoc.location_name;
    }

    const { error: upsertError } = await supabase
      .from('shopify_inventory_levels')
      .upsert({
        store_key: storeKey,
        inventory_item_id: inventoryItemId,
        location_gid: locationGid,
        location_name: locationName,
        available: available,
        shopify_updated_at: payload.updated_at || new Date().toISOString()
      }, {
        onConflict: 'store_key,inventory_item_id,location_gid'
      });

    if (upsertError) {
      console.error('Failed to upsert shopify_inventory_levels:', upsertError);
    } else {
      console.log(`✓ Upserted inventory level: ${storeKey}/${inventoryItemId}@${locationGid} = ${available} (${locationName || 'no name'})`);
    }
  }

  // STEP 2: Find matching items by Shopify inventory item ID AND matching location
  // For "shopify" truth mode: update quantity directly from Shopify
  // For "database" mode: only flag drift as an alert
  const { data: matchingItems, error } = await supabase
    .from('intake_items')
    .select('id, quantity, sku, type, shopify_product_id, shopify_variant_id, shopify_drift')
    .eq('store_key', storeKey)
    .eq('shopify_inventory_item_id', inventoryItemId)
    .eq('shopify_location_gid', locationGid)
    .is('deleted_at', null);

  if (error) {
    console.error('Failed to fetch matching items:', error);
    return;
  }

  if (!matchingItems?.length) {
    console.log(`No items found for inventory ${inventoryItemId} at location ${locationGid}`);
    return;
  }

  const now = new Date().toISOString();

  for (const item of matchingItems) {
    const localQty = item.quantity || 0;
    const shopifyQty = available;
    const hasDrift = localQty !== shopifyQty;

    if (truthMode === 'shopify') {
      // Shopify is source of truth: update intake_items.quantity directly
      const updateData: any = {
        quantity: Math.max(0, shopifyQty),
        last_shopify_seen_at: now,
        updated_by: 'shopify_webhook_truth_sync',
        updated_at: now
      };

      // Clear drift since we're syncing from Shopify (the truth)
      if (item.shopify_drift) {
        updateData.shopify_drift = false;
        updateData.shopify_drift_detected_at = null;
        updateData.shopify_drift_details = null;
      }

      // If quantity goes to 0, mark as sold
      if (shopifyQty === 0 && localQty > 0) {
        updateData.sold_at = now;
        updateData.sold_channel = 'shopify_inventory_sync';
        updateData.sold_currency = 'USD';
      }

      const { error: updateError } = await supabase
        .from('intake_items')
        .update(updateData)
        .eq('id', item.id);

      if (updateError) {
        console.error(`Failed to update item ${item.id} quantity:`, updateError);
      } else {
        console.log(`[Shopify Truth] Updated item ${item.id} (${item.sku}) quantity: ${localQty} → ${shopifyQty}`);
      }
    } else {
      // Database is source of truth: only flag drift as alert, don't update quantity
      if (hasDrift && !item.shopify_drift) {
        const { error: driftError } = await supabase
          .from('intake_items')
          .update({
            shopify_drift: true,
            shopify_drift_detected_at: now,
            shopify_drift_details: {
              expected: localQty,
              actual: shopifyQty,
              location_gid: locationGid,
              detected_by: 'webhook',
              detected_at: now,
              mode: 'database_truth'
            },
            last_shopify_seen_at: now,
            updated_at: now
          })
          .eq('id', item.id);

        if (!driftError) {
          console.log(`[Database Truth] Flagged drift for ${item.sku}: local=${localQty}, shopify=${shopifyQty}`);
        }
      } else if (!hasDrift && item.shopify_drift) {
        // Drift resolved externally
        await supabase
          .from('intake_items')
          .update({
            shopify_drift: false,
            shopify_drift_detected_at: null,
            shopify_drift_details: null,
            last_shopify_seen_at: now,
            updated_at: now
          })
          .eq('id', item.id);
        console.log(`[Database Truth] Cleared drift for ${item.sku}`);
      } else {
        // Just update last_shopify_seen_at
        await supabase
          .from('intake_items')
          .update({ last_shopify_seen_at: now })
          .eq('id', item.id);
      }
    }
  }
}

async function handleOrderCancellation(supabase: any, payload: any, shopifyDomain: string | null) {
  const orderId = payload.id?.toString();
  const lineItems = payload.line_items || [];

  if (!orderId || lineItems.length === 0) return;

  console.log(`Handling order cancellation: ${orderId} with ${lineItems.length} line items`);

  const storeKey = await getStoreKeyFromDomain(supabase, shopifyDomain);
  if (!storeKey) return;

  // Get Shopify credentials for location restoration
  const storeKeyUpper = storeKey.toUpperCase().replace(/_STORE$/i, '');
  const { data: credentials } = await supabase
    .from('system_settings')
    .select('key_name, key_value')
    .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`]);

  const credMap = new Map(credentials?.map((c: any) => [c.key_name, c.key_value]) || []);
  const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`);
  const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`);

  for (const lineItem of lineItems) {
    const sku = lineItem.sku;
    const quantity = lineItem.quantity || 0;

    if (!sku) continue;

    // Find items that were sold in this order
    const { data: items, error } = await supabase
      .from('intake_items')
      .select('id, quantity, type, sold_at, shopify_inventory_item_id, shopify_location_gid')
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

        // CRITICAL: Restore cards.status to 'available' for 1-of-1 items
        const { error: cardError } = await supabase
          .from('cards')
          .update({
            status: 'available',
            updated_at: new Date().toISOString()
          })
          .eq('sku', sku)
          .eq('status', 'sold');

        if (cardError) {
          console.error(`Failed to restore card status for SKU ${sku}:`, cardError);
        } else {
          console.log(`✓ Restored cards.status to 'available' for SKU ${sku}`);
        }

        // Re-establish location ownership by setting Shopify inventory back to 1
        if (domain && token && item.shopify_inventory_item_id && item.shopify_location_gid) {
          const locationId = item.shopify_location_gid.replace('gid://shopify/Location/', '');
          
          try {
            const shopifyResponse = await fetch(
              `https://${domain}/admin/api/2024-07/inventory_levels/set.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': token,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  location_id: locationId,
                  inventory_item_id: item.shopify_inventory_item_id,
                  available: 1
                })
              }
            );

            if (shopifyResponse.ok) {
              console.log(`✓ Restored Shopify inventory for ${sku} at location ${locationId}`);
              
              // Update cards.current_shopify_location_id
              await supabase
                .from('cards')
                .update({ current_shopify_location_id: item.shopify_location_gid })
                .eq('sku', sku);
            } else {
              const errorText = await shopifyResponse.text();
              console.error(`Failed to restore Shopify inventory: ${errorText}`);
              
              // Queue for retry
              await supabase.from('retry_jobs').insert({
                job_type: 'ENFORCE_LOCATION',
                sku,
                payload: {
                  desired_location_id: item.shopify_location_gid,
                  inventory_item_id: item.shopify_inventory_item_id,
                  store_key: storeKey,
                  reason: 'order_cancellation'
                }
              });
            }
          } catch (shopifyError) {
            console.error('Shopify API error during cancellation restore:', shopifyError);
            
            // Queue for retry
            await supabase.from('retry_jobs').insert({
              job_type: 'ENFORCE_LOCATION',
              sku,
              payload: {
                desired_location_id: item.shopify_location_gid,
                inventory_item_id: item.shopify_inventory_item_id,
                store_key: storeKey,
                reason: 'order_cancellation'
              }
            });
          }
        }
      } else {
        // For raw items: Shopify handles inventory restoration on cancellation
        // We receive inventory_levels/update webhook which will sync the new quantity
        // Just update our local record to match what Shopify will send
        const restoredQty = (item.quantity || 0) + quantity;
        
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: restoredQty,
            sold_at: null, // Clear sold status
            sold_order_id: null,
            updated_by: 'shopify_webhook_cancellation',
            last_shopify_seen_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore raw item quantity:', updateError);
        } else {
          console.log(`[Shopify Truth] Restored raw item ${item.id} quantity to ${restoredQty} (Shopify handles actual inventory)`);
        }
        
        // NOTE: No Shopify write needed - Shopify automatically restores inventory on cancellation
        // The inventory_levels/update webhook will confirm the new quantity
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

  // Get Shopify credentials for location restoration
  const storeKeyUpper = storeKey.toUpperCase().replace(/_STORE$/i, '');
  const { data: credentials } = await supabase
    .from('system_settings')
    .select('key_name, key_value')
    .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`]);

  const credMap = new Map(credentials?.map((c: any) => [c.key_name, c.key_value]) || []);
  const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`);
  const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`);

  for (const refundItem of refundLineItems) {
    const lineItem = refundItem.line_item;
    const sku = lineItem?.sku;
    const refundQuantity = refundItem.quantity || 0;

    if (!sku) continue;

    // Find items that were sold in this order
    const { data: items, error } = await supabase
      .from('intake_items')
      .select('id, quantity, type, shopify_inventory_item_id, shopify_location_gid')
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
            sold_order_id: null,
            sold_channel: null,
            updated_by: 'shopify_webhook'
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore refunded graded item:', updateError);
        } else {
          console.log(`Restored graded item ${item.id} from refund`);
        }

        // CRITICAL: Restore cards.status to 'available' for 1-of-1 items
        const { error: cardError } = await supabase
          .from('cards')
          .update({
            status: 'available',
            updated_at: new Date().toISOString()
          })
          .eq('sku', sku)
          .eq('status', 'sold');

        if (cardError) {
          console.error(`Failed to restore card status for SKU ${sku}:`, cardError);
        } else {
          console.log(`✓ Restored cards.status to 'available' for SKU ${sku}`);
        }

        // Re-establish location ownership by setting Shopify inventory back to 1
        if (domain && token && item.shopify_inventory_item_id && item.shopify_location_gid) {
          const locationId = item.shopify_location_gid.replace('gid://shopify/Location/', '');
          
          try {
            const shopifyResponse = await fetch(
              `https://${domain}/admin/api/2024-07/inventory_levels/set.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': token,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  location_id: locationId,
                  inventory_item_id: item.shopify_inventory_item_id,
                  available: 1
                })
              }
            );

            if (shopifyResponse.ok) {
              console.log(`✓ Restored Shopify inventory for ${sku} at location ${locationId}`);
              
              // Update cards.current_shopify_location_id
              await supabase
                .from('cards')
                .update({ current_shopify_location_id: item.shopify_location_gid })
                .eq('sku', sku);
            } else {
              const errorText = await shopifyResponse.text();
              console.error(`Failed to restore Shopify inventory: ${errorText}`);
              
              // Queue for retry
              await supabase.from('retry_jobs').insert({
                job_type: 'ENFORCE_LOCATION',
                sku,
                payload: {
                  desired_location_id: item.shopify_location_gid,
                  inventory_item_id: item.shopify_inventory_item_id,
                  store_key: storeKey,
                  reason: 'refund'
                }
              });
            }
          } catch (shopifyError) {
            console.error('Shopify API error during refund restore:', shopifyError);
            
            // Queue for retry
            await supabase.from('retry_jobs').insert({
              job_type: 'ENFORCE_LOCATION',
              sku,
              payload: {
                desired_location_id: item.shopify_location_gid,
                inventory_item_id: item.shopify_inventory_item_id,
                store_key: storeKey,
                reason: 'refund'
              }
            });
          }
        }
      } else {
        // For raw items: Shopify handles inventory restoration on refund
        // We receive inventory_levels/update webhook which will sync the new quantity
        const restoredQty = (item.quantity || 0) + refundQuantity;
        
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: restoredQty,
            updated_by: 'shopify_webhook_refund',
            last_shopify_seen_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Failed to restore refunded raw item:', updateError);
        } else {
          console.log(`[Shopify Truth] Restored raw item ${item.id} quantity to ${restoredQty} (Shopify handles actual inventory)`);
        }
        
        // NOTE: No Shopify write needed - Shopify automatically restores inventory on refund
        // The inventory_levels/update webhook will confirm the new quantity
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