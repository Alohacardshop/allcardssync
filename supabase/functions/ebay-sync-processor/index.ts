import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getValidAccessToken,
  createOrUpdateInventoryItem,
  createOffer,
  publishOffer,
  updateOffer,
  deleteInventoryItem,
  getOffersBySku,
  mapConditionToEbay,
} from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessorRequest {
  batch_size?: number
  store_key?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { batch_size = 10, store_key }: ProcessorRequest = await req.json().catch(() => ({}))

    console.log(`[ebay-sync-processor] Starting batch processing, size=${batch_size}`)

    // Get queued items
    let query = supabase
      .from('ebay_sync_queue')
      .select(`
        id,
        inventory_item_id,
        action,
        payload,
        retry_count,
        intake_items!inner (
          id,
          sku,
          subject,
          brand_title,
          year,
          card_number,
          grade,
          price,
          quantity,
          psa_cert,
          grading_company,
          image_urls,
          ebay_inventory_item_sku,
          ebay_offer_id,
          ebay_listing_id,
          store_key
        )
      `)
      .eq('status', 'queued')
      .order('queue_position', { ascending: true })
      .limit(batch_size)

    const { data: queueItems, error: queueError } = await query

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`)
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No items in queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[ebay-sync-processor] Found ${queueItems.length} items to process`)

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped_sold: 0,
      errors: [] as { item_id: string; error: string }[],
    }

    // Group items by store for token efficiency
    const itemsByStore = new Map<string, typeof queueItems>()
    for (const item of queueItems) {
      const itemStoreKey = (item.intake_items as any)?.store_key
      if (!itemStoreKey) continue
      
      if (!itemsByStore.has(itemStoreKey)) {
        itemsByStore.set(itemStoreKey, [])
      }
      itemsByStore.get(itemStoreKey)!.push(item)
    }

    // Process each store's items
    for (const [currentStoreKey, storeItems] of itemsByStore) {
      // Get store config
      const { data: storeConfig } = await supabase
        .from('ebay_store_config')
        .select('*')
        .eq('store_key', currentStoreKey)
        .single()

      if (!storeConfig) {
        console.warn(`[ebay-sync-processor] No config for store ${currentStoreKey}, skipping`)
        continue
      }

      const environment = storeConfig.environment as 'sandbox' | 'production'
      const isDryRun = storeConfig.dry_run_mode === true

      if (isDryRun) {
        console.log(`[ebay-sync-processor] DRY RUN MODE for ${currentStoreKey} - skipping real eBay API calls`)
      }

      // Get access token once per store (skip in dry run mode)
      let accessToken: string
      try {
        accessToken = await getValidAccessToken(supabase, currentStoreKey, environment)
      } catch (tokenError) {
        console.error(`[ebay-sync-processor] Token error for ${currentStoreKey}:`, tokenError)
        // Mark all items for this store as failed
        for (const item of storeItems) {
          await markQueueItemFailed(supabase, item.id, item.inventory_item_id, tokenError.message, item.retry_count)
          results.failed++
        }
        continue
      }

      // Process each item
      for (const queueItem of storeItems) {
        results.processed++
        const item = queueItem.intake_items as any
        const isGraded = item.grading_company && item.grading_company !== 'RAW' && item.grading_company !== 'UNGRADED'

        try {
          // =======================================================
          // CRITICAL INVARIANT: For graded/1-of-1 cards, enforce
          // quantity based on cards.status, NOT intake_items.quantity
          // =======================================================
          let effectiveQuantity = item.quantity ?? 1
          
          if (isGraded && item.sku) {
            const { data: cardRecord, error: cardError } = await supabase
              .from('cards')
              .select('status, sku')
              .eq('sku', item.sku)
              .maybeSingle()

            if (cardError) {
              console.warn(`[ebay-sync-processor] Failed to query cards table for SKU ${item.sku}: ${cardError.message}`)
            }

            if (cardRecord) {
              if (cardRecord.status === 'sold') {
                // BLOCKED: Never create/update eBay listing for a sold card
                console.warn(`[ebay-sync-processor] BLOCKED: Card ${item.sku} is SOLD in cards table. Skipping action=${queueItem.action}`)
                
                // Mark queue item as completed (skip gracefully)
                await supabase
                  .from('ebay_sync_queue')
                  .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    error_message: 'Skipped: Card is sold',
                  })
                  .eq('id', queueItem.id)
                
                results.skipped_sold++
                continue
              } else if (cardRecord.status === 'available') {
                effectiveQuantity = 1
              } else {
                // Unknown status, default to 0 for safety
                effectiveQuantity = 0
              }
            } else {
              // Card not in cards table - try to auto-create via ensure_card_exists
              const { error: ensureError } = await supabase.rpc('ensure_card_exists', {
                p_sku: item.sku,
                p_inventory_item_id: item.shopify_inventory_item_id || null,
                p_variant_id: item.shopify_variant_id || null,
                p_ebay_offer_id: item.ebay_offer_id || null,
                p_location_id: item.shopify_location_gid || null
              })
              
              if (ensureError) {
                console.warn(`[ebay-sync-processor] Failed to ensure_card_exists for ${item.sku}: ${ensureError.message}`)
              }
              
              // Re-check status after creation
              const { data: newCard } = await supabase
                .from('cards')
                .select('status')
                .eq('sku', item.sku)
                .maybeSingle()
              
              if (newCard?.status === 'sold') {
                console.warn(`[ebay-sync-processor] BLOCKED: Newly queried card ${item.sku} is SOLD. Skipping.`)
                await supabase
                  .from('ebay_sync_queue')
                  .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    error_message: 'Skipped: Card is sold',
                  })
                  .eq('id', queueItem.id)
                
                results.skipped_sold++
                continue
              }
              
              effectiveQuantity = 1
            }
            
            // Log if intake_items.quantity is suspicious
            if ((item.quantity ?? 1) > 1) {
              console.error(`[ebay-sync-processor] INVARIANT VIOLATION: SKU ${item.sku} has intake_items.quantity=${item.quantity} but is graded. Clamping to 1.`)
            }
          }
          
          // Inject effective quantity into item for downstream use
          item._effectiveQuantity = effectiveQuantity

          // Mark as processing
          await supabase
            .from('ebay_sync_queue')
            .update({ 
              status: 'processing', 
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueItem.id)

          let syncResult: { success: boolean; data?: any; error?: string }

          switch (queueItem.action) {
            case 'create':
              syncResult = await processCreate(supabase, accessToken, environment, item, storeConfig, isDryRun)
              break
            case 'update':
              syncResult = await processUpdate(supabase, accessToken, environment, item, storeConfig, isDryRun)
              break
            case 'delete':
              syncResult = await processDelete(supabase, accessToken, environment, item, isDryRun)
              break
            default:
              syncResult = { success: false, error: `Unknown action: ${queueItem.action}` }
          }

          if (syncResult.success) {
            // Mark queue item as completed
            await supabase
              .from('ebay_sync_queue')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', queueItem.id)

            results.succeeded++
            console.log(`[ebay-sync-processor] Success: ${queueItem.action} item=${item.id}`)
          } else {
            throw new Error(syncResult.error || 'Unknown error')
          }

        } catch (error) {
          console.error(`[ebay-sync-processor] Failed item=${item.id}:`, error)
          await markQueueItemFailed(supabase, queueItem.id, item.id, error.message, queueItem.retry_count)
          results.failed++
          results.errors.push({ item_id: item.id, error: error.message })
        }

        // Small delay between items to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`[ebay-sync-processor] Complete: ${results.succeeded}/${results.processed} succeeded`)

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[ebay-sync-processor] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function processCreate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  storeConfig: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; data?: any; error?: string }> {
  const ebaySku = item.sku || `INV-${item.id.substring(0, 8)}`
  const title = buildTitle(item).substring(0, 80)
  const description = buildDescription(item)
  
  // Use effective quantity (derived from cards.status for graded items)
  const quantity = item._effectiveQuantity ?? item.quantity ?? 1

  // DRY RUN: Simulate success without calling eBay APIs
  if (isDryRun) {
    const fakeOfferId = `DRY-RUN-OFFER-${Date.now()}`
    const fakeListingId = `DRY-RUN-LISTING-${Date.now()}`
    
    console.log(`[ebay-sync-processor] DRY RUN: Would create listing for SKU ${ebaySku}, title: ${title}`)
    
    await supabase
      .from('intake_items')
      .update({
        ebay_inventory_item_sku: ebaySku,
        ebay_offer_id: fakeOfferId,
        ebay_listing_id: fakeListingId,
        ebay_listing_url: `[DRY RUN] Would list at ebay.com/itm/${fakeListingId}`,
        ebay_sync_status: 'dry_run',
        ebay_sync_error: null,
        last_ebay_synced_at: new Date().toISOString(),
        ebay_sync_snapshot: {
          timestamp: new Date().toISOString(),
          action: 'create',
          dry_run: true,
          simulated: true,
          sku: ebaySku,
        },
      })
      .eq('id', item.id)

    return { success: true, data: { listing_id: fakeListingId, dry_run: true } }
  }

  // Create inventory item
  const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, {
    sku: ebaySku,
    product: {
      title,
      description,
      imageUrls: item.image_urls || [],
    },
    condition: mapConditionToEbay(item.grade ? 'excellent' : 'new'),
    availability: {
      shipToLocationAvailability: {
        quantity,
      },
    },
  })

  if (!inventoryResult.success) {
    return inventoryResult
  }

  // Create offer
  const offerResult = await createOffer(accessToken, environment, {
    sku: ebaySku,
    marketplaceId: storeConfig.marketplace_id || 'EBAY_US',
    format: 'FIXED_PRICE',
    listingDescription: description,
    availableQuantity: quantity,
    pricingSummary: {
      price: {
        value: (item.price || 0).toFixed(2),
        currency: 'USD',
      },
    },
    listingPolicies: {
      fulfillmentPolicyId: storeConfig.default_fulfillment_policy_id || '',
      paymentPolicyId: storeConfig.default_payment_policy_id || '',
      returnPolicyId: storeConfig.default_return_policy_id || '',
    },
    categoryId: storeConfig.default_category_id || '183454',
  })

  if (!offerResult.success) {
    return offerResult
  }

  // Publish offer
  const publishResult = await publishOffer(accessToken, environment, offerResult.offerId!)

  if (!publishResult.success) {
    return publishResult
  }

  const listingUrl = environment === 'sandbox'
    ? `https://sandbox.ebay.com/itm/${publishResult.listingId}`
    : `https://www.ebay.com/itm/${publishResult.listingId}`

  // Update intake item
  await supabase
    .from('intake_items')
    .update({
      ebay_inventory_item_sku: ebaySku,
      ebay_offer_id: offerResult.offerId,
      ebay_listing_id: publishResult.listingId,
      ebay_listing_url: listingUrl,
      ebay_sync_status: 'synced',
      ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(),
        action: 'create',
        sku: ebaySku,
        offer_id: offerResult.offerId,
        listing_id: publishResult.listingId,
      },
    })
    .eq('id', item.id)

  return { success: true, data: { listing_id: publishResult.listingId } }
}

async function processUpdate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  storeConfig: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const ebaySku = item.ebay_inventory_item_sku || item.sku

  if (!ebaySku) {
    return { success: false, error: 'No eBay SKU found for update' }
  }

  // Use effective quantity (derived from cards.status for graded items)
  const quantity = item._effectiveQuantity ?? item.quantity ?? 1

  // DRY RUN: Simulate success without calling eBay APIs
  if (isDryRun) {
    console.log(`[ebay-sync-processor] DRY RUN: Would update listing for SKU ${ebaySku}`)
    
    await supabase
      .from('intake_items')
      .update({
        ebay_sync_status: 'dry_run',
        ebay_sync_error: null,
        last_ebay_synced_at: new Date().toISOString(),
        ebay_sync_snapshot: {
          timestamp: new Date().toISOString(),
          action: 'update',
          dry_run: true,
          simulated: true,
          sku: ebaySku,
        },
      })
      .eq('id', item.id)

    return { success: true }
  }

  // Update inventory item
  const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, {
    sku: ebaySku,
    product: {
      title: buildTitle(item).substring(0, 80),
      description: buildDescription(item),
      imageUrls: item.image_urls || [],
    },
    condition: mapConditionToEbay(item.grade ? 'excellent' : 'new'),
    availability: {
      shipToLocationAvailability: {
        quantity,
      },
    },
  })

  if (!inventoryResult.success) {
    return inventoryResult
  }

  // Update offer if exists
  if (item.ebay_offer_id) {
    const offerUpdateResult = await updateOffer(accessToken, environment, item.ebay_offer_id, {
      sku: ebaySku,
      marketplaceId: storeConfig.marketplace_id || 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      pricingSummary: {
        price: {
          value: (item.price || 0).toFixed(2),
          currency: 'USD',
        },
      },
      listingPolicies: {
        fulfillmentPolicyId: storeConfig.default_fulfillment_policy_id || '',
        paymentPolicyId: storeConfig.default_payment_policy_id || '',
        returnPolicyId: storeConfig.default_return_policy_id || '',
      },
      categoryId: storeConfig.default_category_id || '183454',
    })

    if (!offerUpdateResult.success) {
      return offerUpdateResult
    }
  }

  // Update intake item
  await supabase
    .from('intake_items')
    .update({
      ebay_sync_status: 'synced',
      ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(),
        action: 'update',
        sku: ebaySku,
      },
    })
    .eq('id', item.id)

  return { success: true }
}

async function processDelete(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const ebaySku = item.ebay_inventory_item_sku

  if (!ebaySku) {
    // Nothing to delete
    return { success: true }
  }

  // DRY RUN: Simulate success without calling eBay APIs
  if (isDryRun) {
    console.log(`[ebay-sync-processor] DRY RUN: Would delete listing for SKU ${ebaySku}`)
    
    await supabase
      .from('intake_items')
      .update({
        ebay_inventory_item_sku: null,
        ebay_offer_id: null,
        ebay_listing_id: null,
        ebay_listing_url: null,
        ebay_sync_status: 'dry_run',
        ebay_sync_error: null,
        ebay_sync_snapshot: {
          timestamp: new Date().toISOString(),
          action: 'delete',
          dry_run: true,
          simulated: true,
          deleted_sku: ebaySku,
        },
      })
      .eq('id', item.id)

    return { success: true }
  }

  const result = await deleteInventoryItem(accessToken, environment, ebaySku)

  if (result.success) {
    // Clear eBay fields from intake item
    await supabase
      .from('intake_items')
      .update({
        ebay_inventory_item_sku: null,
        ebay_offer_id: null,
        ebay_listing_id: null,
        ebay_listing_url: null,
        ebay_sync_status: null,
        ebay_sync_error: null,
        ebay_sync_snapshot: {
          timestamp: new Date().toISOString(),
          action: 'delete',
          deleted_sku: ebaySku,
        },
      })
      .eq('id', item.id)
  }

  return result
}

async function markQueueItemFailed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  itemId: string,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  const maxRetries = 3

  if (retryCount < maxRetries) {
    // Schedule retry
    await supabase
      .from('ebay_sync_queue')
      .update({
        status: 'queued',
        retry_count: retryCount + 1,
        error_message: errorMessage,
        retry_after: new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId)
  } else {
    // Max retries reached
    await supabase
      .from('ebay_sync_queue')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId)

    // Update intake item error status
    await supabase
      .from('intake_items')
      .update({
        ebay_sync_status: 'error',
        ebay_sync_error: errorMessage,
      })
      .eq('id', itemId)
  }
}

function buildTitle(item: any): string {
  const parts = []
  if (item.year) parts.push(item.year)
  if (item.brand_title) parts.push(item.brand_title)
  if (item.subject) parts.push(item.subject)
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (item.grade) parts.push(`PSA ${item.grade}`)
  return parts.join(' ') || 'Trading Card'
}

function buildDescription(item: any): string {
  const lines = [`<h2>${item.subject || 'Trading Card'}</h2>`]
  if (item.brand_title) lines.push(`<p><strong>Brand:</strong> ${item.brand_title}</p>`)
  if (item.year) lines.push(`<p><strong>Year:</strong> ${item.year}</p>`)
  if (item.card_number) lines.push(`<p><strong>Card #:</strong> ${item.card_number}</p>`)
  if (item.grade) lines.push(`<p><strong>Grade:</strong> PSA ${item.grade}</p>`)
  if (item.psa_cert) lines.push(`<p><strong>PSA Cert:</strong> ${item.psa_cert}</p>`)
  return lines.join('\n')
}
