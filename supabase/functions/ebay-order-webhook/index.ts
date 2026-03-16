import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'
 import { createShopifyOrderForEbaySale } from '../_shared/shopify-create-ebay-order.ts'
 import { parseIdFromGid } from '../_shared/shopify-helpers.ts'
 import { buildEbayOrderEmbed, getRegionDiscordConfig, storeKeyToRegionId, regionMeta } from '../_shared/discord-helpers.ts'
 import { isWithinBusinessHours } from '../_shared/business-hours.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EbayOrderNotification {
  metadata?: {
    topic: string;
    schemaVersion: string;
    deprecated: boolean;
  };
  notification?: {
    notificationId: string;
    eventDate: string;
    publishDate: string;
    publishAttemptCount: number;
    data: {
      orderId: string;
      orderLineItems?: Array<{
        lineItemId: string;
        legacyItemId: string;
        legacyVariationId?: string;
        sku?: string;
        title: string;
        quantity: number;
        lineItemCost: {
          value: string;
          currency: string;
        };
        lineItemFulfillmentStatus: string;
      }>;
      buyer?: {
        username: string;
      };
      pricingSummary?: {
        total: {
          value: string;
          currency: string;
        };
      };
      orderFulfillmentStatus?: string;
      orderPaymentStatus?: string;
      creationDate?: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle eBay challenge for endpoint verification
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const challengeCode = url.searchParams.get('challenge_code')
    
    if (challengeCode) {
      const verificationToken = Deno.env.get('EBAY_VERIFICATION_TOKEN') || ''
      const endpoint = Deno.env.get('EBAY_WEBHOOK_ENDPOINT') || req.url.split('?')[0]
      
      // eBay expects SHA-256 hash of challengeCode + verificationToken + endpoint
      const encoder = new TextEncoder()
      const data = encoder.encode(challengeCode + verificationToken + endpoint)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const challengeResponse = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      console.log('[eBay Webhook] Challenge verification request', {
        challengeCode,
        verificationToken: verificationToken ? `${verificationToken.substring(0, 5)}...` : 'EMPTY',
        endpoint,
        challengeResponse
      })
      
      return new Response(
        JSON.stringify({ challengeResponse }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload: EbayOrderNotification = await req.json()
    
    // DETAILED: Log full payload for production debugging (first real events)
    console.log('[eBay Webhook] === INCOMING EVENT ===')
    console.log('[eBay Webhook] Topic:', payload.metadata?.topic)
    console.log('[eBay Webhook] Metadata:', JSON.stringify(payload.metadata || {}))
    console.log('[eBay Webhook] Order ID:', payload.notification?.data?.orderId)
    console.log('[eBay Webhook] Line items count:', payload.notification?.data?.orderLineItems?.length || 0)
    console.log('[eBay Webhook] Full payload:', JSON.stringify(payload))

    const topic = payload.metadata?.topic
    const orderData = payload.notification?.data

    if (!orderData) {
      console.log('[eBay Webhook] No order data in notification')
      return new Response(
        JSON.stringify({ success: true, message: 'No order data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orderId = orderData.orderId
    const orderStatus = orderData.orderPaymentStatus
    const fulfillmentStatus = orderData.orderFulfillmentStatus

    console.log(`[eBay Webhook] Processing order ${orderId}, payment: ${orderStatus}, fulfillment: ${fulfillmentStatus}`)

    // Process based on topic
    if (topic === 'MARKETPLACE_ACCOUNT_DELETION') {
      // Handle account deletion notification
      console.log('[eBay Webhook] Account deletion notification - logging only')
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process order line items for sale tracking
    const lineItems = orderData.orderLineItems || []
    const processedItems: string[] = []
    const errors: string[] = []
    let shopifyOrderNameForNotif: string | null = null
    let resolvedStoreKey: string = 'hawaii'

    for (const lineItem of lineItems) {
      const sku = lineItem.sku
      const ebayItemId = lineItem.legacyItemId
      const quantity = lineItem.quantity

      console.log(`[eBay Webhook] --- Line item: SKU=${sku || 'none'}, ebayItemId=${ebayItemId}, qty=${quantity}, cost=${lineItem.lineItemCost?.value} ${lineItem.lineItemCost?.currency}`)

      if (!sku && !ebayItemId) {
        const msg = `[eBay Webhook] ⚠️ Line item missing both SKU and eBay item ID in order ${orderId}`
        console.error(msg)
        errors.push('Line item missing SKU and item ID')
        // Alert: log as error so this is never silent
        await supabase.from('system_logs').insert({
          level: 'error',
          message: msg,
          source: 'ebay-order-webhook',
          context: { orderId, lineItem: JSON.stringify(lineItem) }
        })
        continue
      }

      try {
        // ======== 1-OF-1 ATOMIC LOCK FOR GRADED ITEMS ========
        if (sku) {
          // RUNTIME GUARD: Ensure card exists before atomic lock
          // This auto-creates cards for legacy eBay items not yet in the cards table
          const { data: ensureResult } = await supabase.rpc('ensure_card_exists', {
            p_sku: sku,
            p_source: 'ebay_order_webhook'
          });
          
          if (ensureResult && ensureResult.length > 0 && ensureResult[0].was_created) {
            console.log(`[eBay Webhook] ⚠️ Auto-created legacy card for SKU ${sku}`);
          }
          
          const sourceEventId = `${orderId}_${sku}`;
          
          const { data: saleResult, error: lockError } = await supabase.rpc('atomic_mark_card_sold', {
            p_sku: sku,
            p_source: 'ebay',
            p_source_event_id: sourceEventId
          });
          
          if (!lockError) {
            const result = Array.isArray(saleResult) ? saleResult[0] : saleResult;
            console.log(`[eBay Webhook] Atomic lock result for ${sku}: ${result?.result || 'unknown'}`);
            
            if (result?.result === 'sold') {
              // Card was successfully locked - fetch card details for cross-channel sync
              const { data: card } = await supabase
                .from('cards')
                .select('id, shopify_inventory_item_id, current_shopify_location_id, shopify_variant_id')
                .eq('sku', sku)
                .single();
              
              // Fetch intake_items data for store_key and variant — needed for both inventory zero AND order creation
              const { data: itemData } = await supabase
                .from('intake_items')
                .select('store_key, shopify_variant_id')
                .eq('sku', sku)
                .limit(1)
                .single();
              
              const storeKey = itemData?.store_key || 'hawaii';
              resolvedStoreKey = storeKey;
              const storeKeyUpper = storeKey.toUpperCase().replace(/_STORE$/i, '');
              
              // Fetch Shopify credentials (needed for both zero + order creation)
              const { data: credentials } = await supabase
                .from('system_settings')
                .select('key_name, key_value')
                .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`]);
              
              const credMap = new Map(credentials?.map(c => [c.key_name, c.key_value]) || []);
              const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`);
              const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`);

              if (card?.shopify_inventory_item_id && card?.current_shopify_location_id) {
                // Try to zero Shopify inventory
                console.log(`[eBay Webhook] Cross-channel: zeroing Shopify for ${sku}`);

                if (domain && token) {
                  const requestId = generateRequestId('ebay-sale-zero');
                  const locationId = locationGidToId(card.current_shopify_location_id);
                  
                  const inventoryResult = await writeInventory({
                    domain,
                    token,
                    inventory_item_id: card.shopify_inventory_item_id,
                    location_id: locationId,
                    action: 'cross_channel_zero',
                    quantity: 0,
                    request_id: requestId,
                    store_key: storeKey,
                    sku,
                    source_function: 'ebay-order-webhook',
                    triggered_by: 'webhook',
                    supabase
                  });
                  
                  if (inventoryResult.success) {
                    console.log(`[eBay Webhook] ✓ Shopify inventory zeroed for ${sku}`);
                  } else {
                    const errMsg = `Shopify inventory zero FAILED for SKU ${sku} (eBay order ${orderId}). Queued for retry.`;
                    console.error(`[eBay Webhook] 🚨 ${errMsg}`, inventoryResult.error);
                    errors.push(errMsg);
                    
                    // CRITICAL ALERT: Shopify zero failed — log as error
                    await supabase.from('system_logs').insert({
                      level: 'error',
                      message: errMsg,
                      source: 'ebay-order-webhook',
                      context: {
                        orderId,
                        sku,
                        shopify_inventory_item_id: card.shopify_inventory_item_id,
                        location_id: card.current_shopify_location_id,
                        store_key: storeKey,
                        error: String(inventoryResult.error)
                      }
                    });
                    
                    await supabase.rpc('queue_shopify_zero', {
                      p_sku: sku,
                      p_inventory_item_id: card.shopify_inventory_item_id,
                      p_location_id: card.current_shopify_location_id,
                      p_store_key: storeKey
                    });
                  }
                } else {
                  const missingMsg = `Card ${sku} sold on eBay but missing Shopify credentials (domain=${!!domain}, token=${!!token})`;
                  console.error(`[eBay Webhook] 🚨 ${missingMsg}`);
                  errors.push(missingMsg);
                  await supabase.from('system_logs').insert({
                    level: 'error',
                    message: missingMsg,
                    source: 'ebay-order-webhook',
                    context: { orderId, sku, storeKey: storeKey }
                  });
                }
              } else {
                // Card has no Shopify IDs — log as warning (may be eBay-only item)
                console.log(`[eBay Webhook] Card ${sku} has no Shopify inventory IDs — skipping cross-channel zero`);
              }
              
              // Also update intake_items for this SKU
              await supabase
                .from('intake_items')
                .update({
                  quantity: 0,
                  sold_at: new Date().toISOString(),
                  sold_channel: 'ebay',
                  sold_order_id: orderId,
                  sold_price: parseFloat(lineItem.lineItemCost.value),
                  sold_currency: lineItem.lineItemCost.currency,
                  updated_by: 'ebay_webhook'
                })
                .eq('sku', sku);
              
              // ======== STEP 3: CREATE SHOPIFY ORDER FOR STAFF PULL ========
              // SAFETY: Only create a Shopify order if we have a CONFIRMED variant mapping.
              // The cards table is the authoritative source; intake_items is a secondary check.
              // We do NOT create orders from ambiguous or fallback-resolved variants.
              const cardVariantId = card?.shopify_variant_id;
              const intakeVariantId = itemData?.shopify_variant_id;
              
              // Determine if we have a confident variant mapping
              let confirmedVariantId: string | null = null;
              let variantSource = 'none';
              
              if (cardVariantId) {
                // Cards table is authoritative — trust it
                confirmedVariantId = cardVariantId;
                variantSource = 'cards';
              } else if (intakeVariantId) {
                // intake_items has a variant but cards doesn't — this is a weaker signal
                // Only use if card didn't have shopify fields at all (eBay-only items won't have card shopify data)
                if (!card?.shopify_inventory_item_id) {
                  confirmedVariantId = intakeVariantId;
                  variantSource = 'intake_items (no card shopify data)';
                } else {
                  // Card has shopify_inventory_item_id but no variant — data inconsistency
                  console.warn(`[eBay Webhook] ⚠️ Card ${sku} has shopify_inventory_item_id but no variant_id — skipping order creation (data inconsistency)`);
                  await supabase.from('system_logs').insert({
                    level: 'warning',
                    message: `Shopify order skipped for ${sku}: card has inventory_item_id but no variant_id (inconsistent mapping)`,
                    source: 'ebay-order-webhook',
                    context: { orderId, sku, shopify_inventory_item_id: card.shopify_inventory_item_id, intakeVariantId }
                  });
                  variantSource = 'inconsistent';
                }
              }
              
              if (confirmedVariantId && domain && token) {
                // Idempotency: check if we already created a Shopify order for this sale event
                const sourceEventId = `${orderId}_${sku}`;
                const { data: existingSale } = await supabase
                  .from('sales_events')
                  .select('shopify_order_id')
                  .eq('source_event_id', sourceEventId)
                  .single();
                
                if (existingSale?.shopify_order_id) {
                  console.log(`[eBay Webhook] Shopify order already exists for ${sourceEventId}: ${existingSale.shopify_order_id}`);
                  processedItems.push(`${sku} (atomic lock, shopify order exists)`);
                } else {
                  const locationNumericId = card?.current_shopify_location_id 
                    ? locationGidToId(card.current_shopify_location_id) 
                    : undefined;
                  
                  const resolvedVariantNumericId = parseIdFromGid(confirmedVariantId) || confirmedVariantId;
                  console.log(`[eBay Webhook] Creating Shopify order: variant=${resolvedVariantNumericId} (source: ${variantSource})`);
                  
                  const orderResult = await createShopifyOrderForEbaySale({
                    domain,
                    token,
                    sku,
                    variantId: resolvedVariantNumericId,
                    quantity,
                    pricePerUnit: parseFloat(lineItem.lineItemCost.value),
                    currency: lineItem.lineItemCost.currency || 'USD',
                    ebayOrderId: orderId,
                    ebayItemId,
                    locationId: locationNumericId,
                    // eBay enrichment
                    buyerUsername: orderData.buyer?.username,
                    itemTitle: lineItem.title,
                    ebayCreationDate: orderData.creationDate,
                    ebayTotal: orderData.pricingSummary?.total,
                  });
                  
                  if (orderResult.success) {
                    shopifyOrderNameForNotif = orderResult.shopifyOrderName || null;
                    console.log(`[eBay Webhook] ✅ Shopify order ${orderResult.shopifyOrderName} created for eBay sale ${sku}`);
                    
                    // Store Shopify order ID on sales_events
                    await supabase
                      .from('sales_events')
                      .update({
                        shopify_order_id: orderResult.shopifyOrderId,
                        shopify_order_name: orderResult.shopifyOrderName,
                        metadata: { shopify_order_created_at: new Date().toISOString(), variant_source: variantSource }
                      })
                      .eq('source_event_id', sourceEventId);
                    
                    // Also store on intake_items
                    await supabase
                      .from('intake_items')
                      .update({ shopify_order_id: orderResult.shopifyOrderId })
                      .eq('sku', sku);
                      
                    processedItems.push(`${sku} (atomic lock + shopify order ${orderResult.shopifyOrderName})`);
                  } else {
                    const errMsg = `Shopify order creation FAILED for eBay sale SKU=${sku}, order=${orderId}: ${orderResult.error}`;
                    console.error(`[eBay Webhook] 🚨 ${errMsg}`);
                    errors.push(errMsg);
                    
                    await supabase.from('system_logs').insert({
                      level: 'error',
                      message: errMsg,
                      source: 'ebay-order-webhook',
                      context: { orderId, sku, ebayItemId, variantId: confirmedVariantId, variantSource, error: orderResult.error }
                    });
                    
                    processedItems.push(`${sku} (atomic lock, shopify order FAILED)`);
                  }
                }
              } else if (!domain || !token) {
                console.log(`[eBay Webhook] No Shopify credentials — skipping order creation for ${sku}`);
                processedItems.push(`${sku} (atomic lock, no shopify creds)`);
              } else {
                // No confirmed variant — log clearly but do NOT create an ambiguous order
                console.log(`[eBay Webhook] No confirmed Shopify variant for ${sku} (source: ${variantSource}) — skipping order creation`);
                await supabase.from('system_logs').insert({
                  level: 'warning',
                  message: `Shopify order skipped for eBay sale ${sku}: no confirmed variant mapping (source: ${variantSource})`,
                  source: 'ebay-order-webhook',
                  context: { orderId, sku, ebayItemId, cardVariantId, intakeVariantId, variantSource }
                });
                processedItems.push(`${sku} (atomic lock, no confirmed variant)`);
              }
              
              continue; // Skip legacy processing
            } else if (result?.result === 'already_sold' || result?.result === 'duplicate_event') {
              console.log(`[eBay Webhook] SKU ${sku} already processed, skipping`);
              processedItems.push(`${sku} (already processed)`);
              continue;
            }
            // If 'not_found', fall through to legacy processing
          }
        }
        
        // ======== LEGACY PROCESSING (for items not in cards table) ========
        // First, find the item to get store_key and actual SKU
        let query = supabase
          .from('intake_items')
          .select('id, sku, quantity, shopify_product_id, shopify_variant_id, store_key, shopify_location_gid')

        if (sku) {
          query = query.eq('ebay_inventory_item_sku', sku)
        } else if (ebayItemId) {
          query = query.eq('ebay_listing_id', ebayItemId)
        }

        const { data: items, error: findError } = await query.limit(1)

        if (findError) {
          console.error(`[eBay Webhook] Error finding item:`, findError)
          errors.push(`Find error for ${sku || ebayItemId}: ${findError.message}`)
          continue
        }

        if (!items || items.length === 0) {
          const noMatchMsg = `eBay sale item lookup FAILED: no matching item for SKU=${sku}, eBay ID=${ebayItemId} in order ${orderId}`;
          console.error(`[eBay Webhook] 🚨 ${noMatchMsg}`)
          errors.push(noMatchMsg)
          
          // CRITICAL ALERT: Item not found — real sale could be missed
          await supabase.from('system_logs').insert({
            level: 'error',
            message: noMatchMsg,
            source: 'ebay-order-webhook',
            context: { orderId, sku, ebayItemId, quantity, lineItemTitle: lineItem.title }
          });
          continue
        }

        const item = items[0]
        const itemSku = item.sku || sku
        const storeKey = item.store_key

        // Check if this store has location priorities configured (multi-location like Hawaii)
        const { data: locationPriorities } = await supabase
          .from('ebay_location_priority')
          .select('id')
          .eq('store_key', storeKey)
          .eq('is_active', true)
          .limit(1)

        const hasMultiLocation = locationPriorities && locationPriorities.length > 0

        if (hasMultiLocation && itemSku) {
          // Use waterfall deduction for multi-location stores (Hawaii)
          console.log(`[eBay Webhook] Using waterfall deduction for ${itemSku} at ${storeKey}`)
          
          const { data: waterfallResult, error: waterfallError } = await supabase
            .rpc('decrement_inventory_waterfall', {
              p_sku: itemSku,
              p_store_key: storeKey,
              p_qty_to_remove: quantity,
              p_dry_run: false
            })

          if (waterfallError) {
            console.error(`[eBay Webhook] Waterfall deduction error:`, waterfallError)
            errors.push(`Waterfall error for ${itemSku}: ${waterfallError.message}`)
            continue
          }

          console.log(`[eBay Webhook] Waterfall result:`, JSON.stringify(waterfallResult))

          // Check if we fulfilled the full quantity
          const remainingQty = waterfallResult?.remaining || 0
          if (remainingQty > 0) {
            console.warn(`[eBay Webhook] Could not fulfill full quantity. Remaining: ${remainingQty}`)
            errors.push(`Partial fulfillment for ${itemSku}: ${remainingQty} units unfulfilled`)
          }

          // Update sold info on affected items
          const decrements = waterfallResult?.decrements || []
          for (const dec of decrements) {
            // Check if item quantity is now 0 to mark as sold
            const { data: updatedItem } = await supabase
              .from('intake_items')
              .select('quantity, shopify_product_id, shopify_variant_id')
              .eq('id', dec.item_id)
              .single()

            if (updatedItem && updatedItem.quantity === 0) {
              await supabase
                .from('intake_items')
                .update({
                  sold_at: new Date().toISOString(),
                  sold_channel: 'ebay',
                  sold_order_id: orderId,
                  sold_price: parseFloat(lineItem.lineItemCost.value),
                  sold_currency: lineItem.lineItemCost.currency,
                  updated_by: 'ebay_webhook'
                })
                .eq('id', dec.item_id)

              // Queue Shopify sync for sold items
              if (updatedItem.shopify_product_id && updatedItem.shopify_variant_id) {
                await supabase
                  .from('shopify_sync_queue')
                  .insert({
                    inventory_item_id: dec.item_id,
                    action: 'update',
                    status: 'queued',
                    retry_count: 0,
                    max_retries: 3,
                    updated_by: 'ebay_webhook'
                  })
              }
            }
          }

          processedItems.push(`${itemSku} (waterfall: ${decrements.length} locations)`)

        } else {
          // Single location store - use simple deduction (Las Vegas)
          const newQuantity = Math.max(0, (item.quantity || 1) - quantity)

          const updateData: Record<string, any> = {
            quantity: newQuantity,
            updated_at: new Date().toISOString(),
            updated_by: 'ebay_webhook'
          }

          if (newQuantity === 0) {
            updateData.sold_at = new Date().toISOString()
            updateData.sold_channel = 'ebay'
            updateData.sold_order_id = orderId
            updateData.sold_price = parseFloat(lineItem.lineItemCost.value)
            updateData.sold_currency = lineItem.lineItemCost.currency
          }

          const { error: updateError } = await supabase
            .from('intake_items')
            .update(updateData)
            .eq('id', item.id)

          if (updateError) {
            console.error(`[eBay Webhook] Error updating item ${item.id}:`, updateError)
            errors.push(`Update error for ${item.sku}: ${updateError.message}`)
            continue
          }

          console.log(`[eBay Webhook] Updated item ${item.sku}: quantity ${item.quantity} -> ${newQuantity}`)
          processedItems.push(item.sku || item.id)

          // Queue Shopify sync if fully sold
          if (item.shopify_product_id && item.shopify_variant_id && newQuantity === 0) {
            console.log(`[eBay Webhook] Queueing Shopify inventory update for ${item.sku}`)
            
            await supabase
              .from('shopify_sync_queue')
              .insert({
                inventory_item_id: item.id,
                action: 'update',
                status: 'queued',
                retry_count: 0,
                max_retries: 3,
                updated_by: 'ebay_webhook'
              })
          }
        }

      } catch (itemError: any) {
        console.error(`[eBay Webhook] Error processing line item:`, itemError)
        errors.push(`Processing error: ${itemError.message}`)
      }
    }

    // ── Send rich Discord notification for eBay sale ──
    if (processedItems.length > 0) {
      try {
        const regionId = storeKeyToRegionId(resolvedStoreKey);
        const regionConfig = await getRegionDiscordConfig(supabase, regionId);
        
        if (regionConfig?.enabled && regionConfig.webhookUrl) {
          const { within: isOpen } = await isWithinBusinessHours(supabase, regionId);
          
          const embed = buildEbayOrderEmbed(
            regionId,
            orderId,
            lineItems.map((li: any) => ({
              sku: li.sku,
              title: li.title || 'Item',
              quantity: li.quantity || 1,
              lineItemCost: li.lineItemCost || { value: '0', currency: 'USD' },
              legacyItemId: li.legacyItemId,
            })),
            orderData.buyer,
            orderData.pricingSummary?.total,
            orderData.creationDate,
            shopifyOrderNameForNotif
          );
          
          const mention = regionConfig.roleId ? `<@&${regionConfig.roleId}>\n` : '';
          
          if (isOpen) {
            const discordRes = await fetch(regionConfig.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `${mention}🏷️ **eBay Sale — Pull Required**`,
                embeds: [embed],
                allowed_mentions: { parse: ['roles'] },
              }),
            });
            
            if (!discordRes.ok) {
              console.error(`[eBay Webhook] Discord send failed: ${discordRes.status}`);
              // Queue for later
              await supabase.from('pending_notifications').insert({
                payload: { _ebay_embed: embed, _ebay_order_id: orderId, _ebay_mention: mention },
                region_id: regionId,
                sent: false,
              });
            } else {
              console.log(`[eBay Webhook] ✓ Sent Discord notification for eBay order ${orderId}`);
            }
          } else {
            // Queue for business hours
            await supabase.from('pending_notifications').insert({
              payload: { _ebay_embed: embed, _ebay_order_id: orderId, _ebay_mention: mention },
              region_id: regionId,
              sent: false,
            });
            console.log(`[eBay Webhook] Queued Discord notification for eBay order ${orderId} (outside business hours)`);
          }
        } else {
          console.log(`[eBay Webhook] Discord not configured for region, skipping notification`);
        }
      } catch (discordErr: any) {
        console.error(`[eBay Webhook] Discord notification error:`, discordErr.message);
      }
    }

    // Log the webhook event
    await supabase
      .from('system_logs')
      .insert({
        level: errors.length > 0 ? 'warning' : 'info',
        message: `eBay order webhook processed: ${orderId}`,
        source: 'ebay-order-webhook',
        context: {
          topic,
          orderId,
          orderStatus,
          fulfillmentStatus,
          processedItems,
          errors,
          lineItemCount: lineItems.length
        }
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId,
        processed: processedItems.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[eBay Webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
