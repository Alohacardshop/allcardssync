import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  acquireInventoryLocks,
  releaseInventoryLocksByBatch,
  filterLockedSkus
} from '../_shared/inventory-lock-helpers.ts'
import {
  getValidAccessToken,
  createOrUpdateInventoryItem,
  createOffer,
  publishOffer,
  updateOffer,
  deleteInventoryItem,
  getOffersBySku,
  mapConditionToEbay,
  ebayApiRequest,
} from '../_shared/ebayApi.ts'
import {
  EBAY_CONDITION_IDS,
  buildGradedConditionDescriptors,
  buildComicConditionDescriptors,
} from '../_shared/ebayConditions.ts'
import {
  getCategorySchema,
  resolveConditionId,
  validateAspects,
} from '../_shared/ebayCategorySchema.ts'
import {
  resolveTemplate,
  buildCategoryAwareAspects,
  buildTitle,
  buildDescription,
  detectCategoryFromBrandDB,
  getEbayCategoryIdDB,
} from '../_shared/ebayTemplateResolver.ts'

// ─── Constants ───────────────────────────────────────────────────

const CONDITION_ID_TO_ENUM: Record<string, string> = {
  '1000': 'NEW',
  '1500': 'NEW_OTHER',
  '1750': 'NEW_WITH_DEFECTS',
  '2000': 'CERTIFIED_REFURBISHED',
  '2010': 'EXCELLENT_REFURBISHED',
  '2020': 'VERY_GOOD_REFURBISHED',
  '2030': 'GOOD_REFURBISHED',
  '2500': 'SELLER_REFURBISHED',
  '2750': 'LIKE_NEW',
  '2990': 'PRE_OWNED_EXCELLENT',
  '3000': 'USED_EXCELLENT',
  '4000': 'USED_VERY_GOOD',
  '5000': 'USED_GOOD',
  '6000': 'USED_ACCEPTABLE',
  '7000': 'FOR_PARTS_OR_NOT_WORKING',
}

function conditionIdToEnum(conditionId: string): string {
  return CONDITION_ID_TO_ENUM[conditionId] || 'USED_VERY_GOOD'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessorRequest {
  batch_size?: number
  store_key?: string
  depth?: number
}

const MAX_CHAIN_DEPTH = 5
const PARALLEL_CONCURRENCY = 3
const MAX_RETRIES = 3

// ─── Request-Scoped Caches ───────────────────────────────────────

/** Template cache: avoids re-resolving the same template for items with identical tags/category */
const templateCache = new Map<string, any>()

/** Tag mapping cache: avoids repeated DB lookups for category policy overrides */
const tagMappingCache = new Map<string, any>()

/** Brand category cache */
const brandCategoryCache = new Map<string, string | null>()

// ─── Queue Action Coalescing ─────────────────────────────────────

interface QueueItem {
  id: string
  inventory_item_id: string
  action: string
  payload: any
  retry_count: number
  queue_position: number
  created_at?: string
  intake_items: any
}

/**
 * Coalesce redundant queue actions for the same inventory item.
 * Rules:
 *   update + update → keep newest
 *   create + update → keep create
 *   update + delete → keep delete
 *   create + delete → cancel both
 */
function coalesceQueueItems(items: QueueItem[]): { keep: QueueItem[]; cancel: QueueItem[] } {
  const byItem = new Map<string, QueueItem[]>()
  for (const item of items) {
    const key = item.inventory_item_id
    if (!byItem.has(key)) byItem.set(key, [])
    byItem.get(key)!.push(item)
  }

  const keep: QueueItem[] = []
  const cancel: QueueItem[] = []

  for (const [, group] of byItem) {
    if (group.length === 1) {
      keep.push(group[0])
      continue
    }

    // Sort by queue_position ascending (oldest first)
    group.sort((a, b) => a.queue_position - b.queue_position)

    const actions = group.map(g => g.action)
    const hasCreate = actions.includes('create')
    const hasDelete = actions.includes('delete')

    if (hasCreate && hasDelete) {
      // create + delete → cancel both
      cancel.push(...group)
      console.log(`[coalesce] create+delete for ${group[0].inventory_item_id} → cancelling both (${group.length} entries)`)
      continue
    }

    if (hasDelete) {
      // anything + delete → keep only delete (newest)
      const deleteItem = group.filter(g => g.action === 'delete').pop()!
      keep.push(deleteItem)
      cancel.push(...group.filter(g => g.id !== deleteItem.id))
      console.log(`[coalesce] *+delete for ${group[0].inventory_item_id} → keeping delete only`)
      continue
    }

    if (hasCreate) {
      // create + update → keep create
      const createItem = group.find(g => g.action === 'create')!
      keep.push(createItem)
      cancel.push(...group.filter(g => g.id !== createItem.id))
      console.log(`[coalesce] create+update for ${group[0].inventory_item_id} → keeping create only`)
      continue
    }

    // update + update → keep newest
    const newest = group[group.length - 1]
    keep.push(newest)
    cancel.push(...group.filter(g => g.id !== newest.id))
    console.log(`[coalesce] update+update for ${group[0].inventory_item_id} → keeping newest`)
  }

  return { keep, cancel }
}

// ─── Fast Path Detection ─────────────────────────────────────────

/**
 * Detect if an update only changes price/quantity (fast path eligible).
 * A fast-path update skips template resolution, taxonomy fetch, and aspect rebuilding.
 */
function isFastPathUpdate(queueItem: QueueItem): boolean {
  if (queueItem.action !== 'update') return false
  const payload = queueItem.payload as any
  if (!payload) return false
  // Explicit fast_path flag from caller
  if (payload.fast_path === true) return true
  // Check if payload only contains price/quantity changes
  const fastKeys = new Set(['price', 'quantity', 'fast_path'])
  const keys = Object.keys(payload)
  return keys.length > 0 && keys.every(k => fastKeys.has(k))
}

// ─── Smart Backoff ───────────────────────────────────────────────

async function handleEbayResponse(response: Response): Promise<void> {
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000
    console.warn(`[ebay-sync-processor] Rate limited (429), backing off ${waitMs}ms`)
    await new Promise(resolve => setTimeout(resolve, waitMs))
    throw new Error(`eBay rate limit hit (429). Retrying after ${waitMs}ms backoff.`)
  }
}

// ─── Main Handler ────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { batch_size = 25, store_key, depth = 0 }: ProcessorRequest = await req.json().catch(() => ({}))

    console.log(`[ebay-sync-processor] Starting batch processing, size=${batch_size}, depth=${depth}`)

    // ─── Fetch queued items ──────────────────────────────────────
    let query = supabase
      .from('ebay_sync_queue')
      .select(`
        id,
        inventory_item_id,
        action,
        payload,
        retry_count,
        queue_position,
        created_at,
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
          store_key,
          variant,
          main_category,
          primary_category,
          condition_type,
          cgc_cert,
          psa_snapshot,
          normalized_tags
        )
      `)
      .eq('status', 'queued')
      .order('queue_position', { ascending: true })
      .limit(batch_size)

    const { data: rawQueueItems, error: queueError } = await query

    if (queueError) throw new Error(`Failed to fetch queue: ${queueError.message}`)

    if (!rawQueueItems || rawQueueItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No items in queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Queue Coalescing ────────────────────────────────────────
    const { keep: queueItems, cancel: cancelledItems } = coalesceQueueItems(rawQueueItems as any)

    if (cancelledItems.length > 0) {
      console.log(`[ebay-sync-processor] Coalesced: ${rawQueueItems.length} → ${queueItems.length} items (${cancelledItems.length} cancelled)`)
      // Batch-mark cancelled items as completed
      const cancelIds = cancelledItems.map(c => c.id)
      const now = new Date().toISOString()
      await supabase
        .from('ebay_sync_queue')
        .update({
          status: 'completed',
          completed_at: now,
          updated_at: now,
          error_message: 'Coalesced: superseded by newer action',
        })
        .in('id', cancelIds)
    }

    console.log(`[ebay-sync-processor] Processing ${queueItems.length} items (after coalescing)`)

    // ─── Lock check ──────────────────────────────────────────────
    const allSkus = queueItems.map(q => (q.intake_items as any)?.sku).filter(Boolean) as string[]
    const storeKeysForLockCheck = [...new Set(queueItems.map(q => (q.intake_items as any)?.store_key).filter(Boolean))]
    
    const lockedSkuSet = new Set<string>()
    for (const sk of storeKeysForLockCheck) {
      const { lockedSkus } = await filterLockedSkus(supabase, allSkus, sk)
      for (const sku of lockedSkus) lockedSkuSet.add(sku)
    }
    
    if (lockedSkuSet.size > 0) {
      console.log(`[ebay-sync-processor] Found ${lockedSkuSet.size} locked SKUs, will skip`)
    }

    // ─── Batch mark processing ───────────────────────────────────
    const processingIds = queueItems.map(q => q.id)
    const now = new Date().toISOString()
    await supabase
      .from('ebay_sync_queue')
      .update({
        status: 'processing',
        started_at: now,
        updated_at: now,
      })
      .in('id', processingIds)

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped_sold: 0,
      skipped_locked: 0,
      coalesced: cancelledItems.length,
      fast_path: 0,
      errors: [] as { item_id: string; error: string }[],
    }

    // ─── Group by store ──────────────────────────────────────────
    const itemsByStore = new Map<string, typeof queueItems>()
    for (const item of queueItems) {
      const itemStoreKey = (item.intake_items as any)?.store_key
      if (!itemStoreKey) continue
      if (!itemsByStore.has(itemStoreKey)) itemsByStore.set(itemStoreKey, [])
      itemsByStore.get(itemStoreKey)!.push(item)
    }

    // ─── Process each store ──────────────────────────────────────
    for (const [currentStoreKey, storeItems] of itemsByStore) {
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
        console.log(`[ebay-sync-processor] DRY RUN MODE for ${currentStoreKey}`)
      }

      // Get access token once per store
      let accessToken: string
      try {
        accessToken = await getValidAccessToken(supabase, currentStoreKey, environment)
      } catch (tokenError) {
        console.error(`[ebay-sync-processor] Token error for ${currentStoreKey}:`, tokenError)
        // Batch-fail all items for this store
        const failIds = storeItems.map(i => i.id)
        const itemIds = storeItems.map(i => (i.intake_items as any)?.id).filter(Boolean)
        await batchMarkFailed(supabase, failIds, itemIds, tokenError.message, storeItems)
        results.failed += storeItems.length
        continue
      }

      // ─── Parallel chunk processing ─────────────────────────────
      for (let chunkStart = 0; chunkStart < storeItems.length; chunkStart += PARALLEL_CONCURRENCY) {
        const chunk = storeItems.slice(chunkStart, chunkStart + PARALLEL_CONCURRENCY)
        
        const chunkResults = await Promise.allSettled(chunk.map(async (queueItem) => {
          results.processed++
          const item = queueItem.intake_items as any
          const isGraded = item.grading_company && item.grading_company !== 'RAW' && item.grading_company !== 'UNGRADED'

          // Skip locked SKUs
          if (item.sku && lockedSkuSet.has(item.sku)) {
            console.log(`[ebay-sync-processor] Skipping locked SKU: ${item.sku}`)
            results.skipped_locked++
            // Revert to queued so it's picked up later
            await supabase.from('ebay_sync_queue').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('id', queueItem.id)
            return
          }

          try {
            // ── Quantity resolution (graded card invariant) ──
            let effectiveQuantity = item.quantity ?? 1
            
            if (isGraded && item.sku) {
              const { data: cardRecord, error: cardError } = await supabase
                .from('cards')
                .select('status, sku')
                .eq('sku', item.sku)
                .maybeSingle()

              if (cardError) {
                console.warn(`[ebay-sync-processor] cards query failed for SKU ${item.sku}: ${cardError.message}`)
              }

              if (cardRecord) {
                if (cardRecord.status === 'sold') {
                  console.warn(`[ebay-sync-processor] BLOCKED: Card ${item.sku} is SOLD. Skipping action=${queueItem.action}`)
                  await supabase.from('ebay_sync_queue').update({
                    status: 'completed', completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(), error_message: 'Skipped: Card is sold',
                  }).eq('id', queueItem.id)
                  results.skipped_sold++
                  return
                }
                effectiveQuantity = cardRecord.status === 'available' ? 1 : 0
              } else {
                const { error: ensureError } = await supabase.rpc('ensure_card_exists', {
                  p_sku: item.sku,
                  p_inventory_item_id: item.shopify_inventory_item_id || null,
                  p_variant_id: item.shopify_variant_id || null,
                  p_ebay_offer_id: item.ebay_offer_id || null,
                  p_location_id: item.shopify_location_gid || null
                })
                if (ensureError) {
                  console.warn(`[ebay-sync-processor] ensure_card_exists failed for ${item.sku}: ${ensureError.message}`)
                }
                const { data: newCard } = await supabase.from('cards').select('status').eq('sku', item.sku).maybeSingle()
                if (newCard?.status === 'sold') {
                  await supabase.from('ebay_sync_queue').update({
                    status: 'completed', completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(), error_message: 'Skipped: Card is sold',
                  }).eq('id', queueItem.id)
                  results.skipped_sold++
                  return
                }
                effectiveQuantity = 1
              }
              
              if ((item.quantity ?? 1) > 1) {
                console.error(`[ebay-sync-processor] INVARIANT VIOLATION: SKU ${item.sku} has quantity=${item.quantity} but is graded. Clamping to 1.`)
              }
            }
            
            item._effectiveQuantity = effectiveQuantity

            // ── Dispatch action ──
            let syncResult: { success: boolean; data?: any; error?: string }

            // Fast path for simple price/quantity updates
            if (isFastPathUpdate(queueItem)) {
              syncResult = await processFastUpdate(supabase, accessToken, environment, item, storeConfig, isDryRun)
              if (syncResult.success) results.fast_path++
            } else {
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
            }

            if (syncResult.success) {
              await supabase.from('ebay_sync_queue').update({
                status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              }).eq('id', queueItem.id)
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
        }))

        // No fixed delay between chunks — only backoff on 429 (handled inside API calls)
      }
    }

    console.log(`[ebay-sync-processor] Complete: ${results.succeeded}/${results.processed} succeeded, ${results.fast_path} fast-path, ${results.coalesced} coalesced`)

    // ─── Self-chain ──────────────────────────────────────────────
    if (depth < MAX_CHAIN_DEPTH) {
      const { count: remainingCount } = await supabase
        .from('ebay_sync_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')

      if (remainingCount && remainingCount > 0) {
        console.log(`[ebay-sync-processor] ${remainingCount} items remaining, self-chaining (depth=${depth + 1})`)
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        fetch(`${supabaseUrl}/functions/v1/ebay-sync-processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ batch_size, depth: depth + 1 }),
        }).catch(err => console.warn(`[ebay-sync-processor] Self-chain failed:`, err))
      }
    }

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

// ─── Cached Helpers ──────────────────────────────────────────────

async function cachedResolveTemplate(supabase: any, item: any, storeKey: string) {
  // Cache key based on normalized_tags + main_category (the template resolution inputs)
  const tags = (item.normalized_tags || []).sort().join(',')
  const key = `${storeKey}:${item.main_category || ''}:${item.primary_category || ''}:${tags}`
  if (templateCache.has(key)) return templateCache.get(key)
  const template = await resolveTemplate(supabase, item, storeKey)
  templateCache.set(key, template)
  return template
}

async function cachedTagMapping(supabase: any, detectedCategory: string | null) {
  if (!detectedCategory) return null
  if (tagMappingCache.has(detectedCategory)) return tagMappingCache.get(detectedCategory)
  const { data } = await supabase
    .from('tag_category_mappings')
    .select('fulfillment_policy_id, payment_policy_id, return_policy_id, price_markup_percent')
    .eq('primary_category', detectedCategory)
    .eq('is_active', true)
    .maybeSingle()
  tagMappingCache.set(detectedCategory, data)
  return data
}

async function cachedDetectCategory(supabase: any, brandTitle: string | null): Promise<string | null> {
  if (!brandTitle) return null
  if (brandCategoryCache.has(brandTitle)) return brandCategoryCache.get(brandTitle)!
  const cat = await detectCategoryFromBrandDB(supabase, brandTitle)
  brandCategoryCache.set(brandTitle, cat)
  return cat
}

// ─── Fast Path: Price/Quantity Only Update ───────────────────────

async function processFastUpdate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  storeConfig: any,
  isDryRun: boolean
): Promise<{ success: boolean; error?: string }> {
  const ebaySku = item.ebay_inventory_item_sku || item.sku
  if (!ebaySku) return { success: false, error: 'No eBay SKU for fast-path update' }

  const quantity = item._effectiveQuantity ?? item.quantity ?? 1

  if (isDryRun) {
    console.log(`[ebay-sync-processor] FAST PATH DRY RUN: SKU ${ebaySku} qty=${quantity} price=${item.price}`)
    await supabase.from('intake_items').update({
      ebay_sync_status: 'dry_run', ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
    }).eq('id', item.id)
    return { success: true }
  }

  console.log(`[ebay-sync-processor] FAST PATH: Updating SKU ${ebaySku} qty=${quantity} price=${item.price}`)

  // Update inventory quantity only (no aspects/title/description rebuild)
  const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, {
    sku: ebaySku,
    product: {
      title: '', // eBay preserves existing if empty on PUT
      description: '',
      imageUrls: [],
    },
    condition: 'USED_VERY_GOOD', // preserved by eBay on update
    availability: {
      shipToLocationAvailability: { quantity },
    },
  })

  if (!inventoryResult.success) return inventoryResult

  // Update offer price if we have an offer ID
  if (item.ebay_offer_id && item.price) {
    const offerUpdateResult = await updateOffer(accessToken, environment, item.ebay_offer_id, {
      availableQuantity: quantity,
      pricingSummary: {
        price: { value: item.price.toFixed(2), currency: 'USD' },
      },
    } as any)

    if (!offerUpdateResult.success) return offerUpdateResult
  }

  await supabase.from('intake_items').update({
    ebay_sync_status: 'synced', ebay_sync_error: null,
    last_ebay_synced_at: new Date().toISOString(),
    ebay_sync_snapshot: {
      timestamp: new Date().toISOString(), action: 'fast_update',
      sku: ebaySku, quantity, price: item.price,
    },
  }).eq('id', item.id)

  return { success: true }
}

// ─── Full Create Flow ────────────────────────────────────────────

async function processCreate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  storeConfig: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; data?: any; error?: string }> {
  const ebaySku = item.sku || `INV-${item.id.substring(0, 8)}`
  
  // Resolve template (cached)
  const template = await cachedResolveTemplate(supabase, item, storeConfig.store_key)
  console.log(`[ebay-sync-processor] Resolved template: ${template?.id || 'none'} (${template?.name || 'default'})`)

  const title = buildTitle(item, template?.title_template).substring(0, 80)
  const description = buildDescription(item, template?.description_template)
  const quantity = item._effectiveQuantity ?? item.quantity ?? 1

  const isGraded = !!item.grade
  if (!template?.category_id) {
    return { success: false, error: 'No template with category_id resolved for this item. Assign a template before listing.' }
  }
  const categoryId = template.category_id
  const marketplaceId = template.marketplace_id || storeConfig.marketplace_id || 'EBAY_US'

  const preferredConditionIds: string[] = 
    (template?.preferred_condition_ids as string[] | null) ||
    (template?.condition_id ? [template.condition_id] : []) ||
    [isGraded ? '2750' : '4000']

  // Category schema (already has 3-tier caching: memory → DB → API)
  const schema = await getCategorySchema(accessToken, environment, marketplaceId, categoryId)
  let conditionId = resolveConditionId(schema, preferredConditionIds, isGraded)
  console.log(`[ebay-sync-processor] Validated conditionId: ${conditionId} for category ${categoryId} marketplace=${marketplaceId}`)

  const isComicCategory = template?.is_graded && (template?.category_name?.toLowerCase().includes('comic') || false)
  let conditionDescriptors: any[] | undefined
  if (isGraded) {
    if (isComicCategory) {
      conditionDescriptors = buildComicConditionDescriptors(
        item.grading_company || template?.default_grader || 'CGC', item.grade, item.cgc_cert || item.psa_cert
      )
    } else {
      conditionDescriptors = buildGradedConditionDescriptors(
        item.grading_company || template?.default_grader || 'PSA', item.grade, item.psa_cert || item.cgc_cert
      )
    }
  }

  // Build aspects (with cached brand detection)
  const detectedCategory = isComicCategory ? 'comics' : (item.primary_category || item.main_category || await cachedDetectCategory(supabase, item.brand_title))
  let aspects = await buildCategoryAwareAspects(supabase, item, detectedCategory)

  if (isGraded) {
    const gradingAspects: Record<string, string[]> = {}
    if (item.grading_company) gradingAspects['Professional Grader'] = [item.grading_company]
    if (item.grade) gradingAspects['Grade'] = [item.grade]
    const certNumber = item.psa_cert || item.cgc_cert
    if (certNumber) gradingAspects['Certification Number'] = [certNumber]
    gradingAspects['Graded'] = ['Yes']
    aspects = { ...aspects, ...gradingAspects }
  }

  const gradingAspectKeys = ['Professional Grader', 'Grade', 'Certification Number', 'Graded']
  const preValidationGradingAspects = isGraded ? gradingAspectKeys.filter(k => aspects[k]) : []
  const { validated: validatedAspects, warnings: aspectWarnings } = validateAspects(schema, aspects)
  aspects = validatedAspects
  if (aspectWarnings.length > 0) {
    console.log(`[ebay-sync-processor] Aspect warnings for ${categoryId}: ${aspectWarnings.join('; ')}`)
  }

  let descriptionSuffix = ''
  if (isGraded && preValidationGradingAspects.length > 0) {
    const removedGradingKeys = preValidationGradingAspects.filter(k => !validatedAspects[k])
    if (removedGradingKeys.length > 0) {
      const grader = item.grading_company || template?.default_grader || ''
      const grade = item.grade || ''
      const cert = item.psa_cert || item.cgc_cert || ''
      const parts = [grader, grade].filter(Boolean).join(' ')
      descriptionSuffix = cert ? `\n<p><strong>Grading:</strong> ${parts} — Cert #${cert}</p>` : `\n<p><strong>Grading:</strong> ${parts}</p>`
      console.log(`[ebay-sync-processor] Grading aspects removed by taxonomy, appended to description: ${removedGradingKeys.join(', ')}`)
    }
    console.log(`[ebay-sync-processor] PUBLISH LOG: templateId=${template?.id}, sku=${ebaySku}, marketplaceId=${marketplaceId}, categoryId=${categoryId}, conditionId=${conditionId}, removedAspects=[${(preValidationGradingAspects.filter(k => !validatedAspects[k])).join(',')}], descriptionFallback=${descriptionSuffix.length > 0}`)
  }

  console.log(`[ebay-sync-processor] PUBLISH LOG: templateId=${template?.id}, sku=${ebaySku}, marketplaceId=${marketplaceId}, categoryId=${categoryId}, conditionId=${conditionId}, removedAspects=[], descriptionFallback=false`)

  // Cached tag mapping lookup
  const tagMappingPolicies = await cachedTagMapping(supabase, detectedCategory)

  const fulfillmentPolicyId = template?.fulfillment_policy_id || tagMappingPolicies?.fulfillment_policy_id || storeConfig.default_fulfillment_policy_id || ''
  const paymentPolicyId = template?.payment_policy_id || tagMappingPolicies?.payment_policy_id || storeConfig.default_payment_policy_id || ''
  const returnPolicyId = template?.return_policy_id || tagMappingPolicies?.return_policy_id || storeConfig.default_return_policy_id || ''

  // DRY RUN
  if (isDryRun) {
    const fakeOfferId = `DRY-RUN-OFFER-${Date.now()}`
    const fakeListingId = `DRY-RUN-LISTING-${Date.now()}`
    console.log(`[ebay-sync-processor] DRY RUN: Would create listing for SKU ${ebaySku}, title: ${title}, category: ${categoryId}`)
    await supabase.from('intake_items').update({
      ebay_inventory_item_sku: ebaySku, ebay_offer_id: fakeOfferId, ebay_listing_id: fakeListingId,
      ebay_listing_url: `[DRY RUN] Would list at ebay.com/itm/${fakeListingId}`,
      ebay_sync_status: 'dry_run', ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(), action: 'create', dry_run: true, simulated: true,
        sku: ebaySku, template_id: template?.id, category_id: categoryId, condition_id: conditionId,
        fulfillment_policy_id: fulfillmentPolicyId, payment_policy_id: paymentPolicyId, return_policy_id: returnPolicyId,
      },
    }).eq('id', item.id)
    return { success: true, data: { listing_id: fakeListingId, dry_run: true } }
  }

  // Create inventory item
  const inventoryPayload: any = {
    sku: ebaySku,
    product: { title, description: description + descriptionSuffix, aspects, imageUrls: item.image_urls || [] },
    condition: conditionIdToEnum(conditionId),
    availability: { shipToLocationAvailability: { quantity } },
  }
  if (conditionDescriptors?.length) inventoryPayload.conditionDescriptors = conditionDescriptors

  const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, inventoryPayload)
  if (!inventoryResult.success) return inventoryResult

  // Calculate price
  const basePrice = item.price || 0
  const markupPercent = template?.price_markup_percent ?? tagMappingPolicies?.price_markup_percent ?? 0
  const finalPrice = basePrice * (1 + markupPercent / 100)

  // Build offer policies object (reusable)
  const listingPolicies: any = {
    fulfillmentPolicyId, paymentPolicyId, returnPolicyId,
    ...(template?.best_offer_enabled ? {
      bestOfferTerms: {
        bestOfferEnabled: true,
        ...(template.auto_accept_price != null ? { autoAcceptPrice: { value: template.auto_accept_price.toFixed(2), currency: 'USD' } } : {}),
        ...(template.auto_decline_percent != null ? { autoDeclinePrice: { value: (finalPrice * template.auto_decline_percent / 100).toFixed(2), currency: 'USD' } } : {}),
      },
    } : {}),
  }

  const offerPayload: any = {
    sku: ebaySku, marketplaceId, format: 'FIXED_PRICE',
    listingDescription: description, availableQuantity: quantity,
    pricingSummary: { price: { value: finalPrice.toFixed(2), currency: 'USD' } },
    listingPolicies, categoryId,
    merchantLocationKey: storeConfig.location_key || undefined,
  }

  // Check for existing offer (idempotent upsert)
  const existingOffers = await getOffersBySku(accessToken, environment, ebaySku)
  let offerId: string | undefined

  if (existingOffers.offers && existingOffers.offers.length > 0) {
    offerId = existingOffers.offers[0].offerId
    console.log(`[processCreate] Existing offer ${offerId} found for SKU ${ebaySku}, updating`)
    const offerUpdateResult = await updateOffer(accessToken, environment, offerId, offerPayload)
    if (!offerUpdateResult.success) {
      if (offerUpdateResult.error?.includes('25002') || offerUpdateResult.error?.includes('Merchant location not registered')) {
        return { success: false, error: `Merchant location '${storeConfig.location_key}' is not registered on eBay. Go to Admin → eBay → Locations and click 'Register Location'.` }
      }
      return offerUpdateResult
    }
  } else {
    const offerResult = await createOffer(accessToken, environment, offerPayload)
    if (!offerResult.success) return offerResult
    offerId = offerResult.offerId
  }

  // Publish offer
  const publishResult = await publishOffer(accessToken, environment, offerId!)
  if (!publishResult.success) return publishResult

  const listingUrl = environment === 'sandbox'
    ? `https://sandbox.ebay.com/itm/${publishResult.listingId}`
    : `https://www.ebay.com/itm/${publishResult.listingId}`

  await supabase.from('intake_items').update({
    ebay_inventory_item_sku: ebaySku, ebay_offer_id: offerId,
    ebay_listing_id: publishResult.listingId, ebay_listing_url: listingUrl,
    ebay_sync_status: 'synced', ebay_sync_error: null,
    last_ebay_synced_at: new Date().toISOString(),
    ebay_sync_snapshot: {
      timestamp: new Date().toISOString(), action: 'create', sku: ebaySku,
      offer_id: offerId, listing_id: publishResult.listingId,
      template_id: template?.id, category_id: categoryId, condition_id: conditionId,
      fulfillment_policy_id: fulfillmentPolicyId, payment_policy_id: paymentPolicyId, return_policy_id: returnPolicyId,
    },
  }).eq('id', item.id)

  return { success: true, data: { listing_id: publishResult.listingId } }
}

// ─── Full Update Flow ────────────────────────────────────────────

async function processUpdate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  storeConfig: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const ebaySku = item.ebay_inventory_item_sku || item.sku
  if (!ebaySku) return { success: false, error: 'No eBay SKU found for update' }

  const quantity = item._effectiveQuantity ?? item.quantity ?? 1

  // Cached template resolution
  const template = await cachedResolveTemplate(supabase, item, storeConfig.store_key)

  const isGraded = !!item.grade
  if (!template?.category_id) {
    return { success: false, error: 'No template with category_id resolved for this item. Assign a template before updating.' }
  }
  const categoryId = template.category_id
  const marketplaceId = template.marketplace_id || storeConfig.marketplace_id || 'EBAY_US'

  const preferredConditionIds: string[] = 
    (template?.preferred_condition_ids as string[] | null) ||
    (template?.condition_id ? [template.condition_id] : []) ||
    [isGraded ? '2750' : '4000']

  const schema = await getCategorySchema(accessToken, environment, marketplaceId, categoryId)
  let conditionId = resolveConditionId(schema, preferredConditionIds, isGraded)
  console.log(`[ebay-sync-processor] Update: Validated conditionId: ${conditionId} for category ${categoryId} marketplace=${marketplaceId}`)

  const isComicCategory = template?.is_graded && (template?.category_name?.toLowerCase().includes('comic') || false)
  const detectedCategory = isComicCategory ? 'comics' : (item.primary_category || item.main_category || await cachedDetectCategory(supabase, item.brand_title))

  // Cached tag mapping
  const tagMappingPolicies = await cachedTagMapping(supabase, detectedCategory)

  const fulfillmentPolicyId = template?.fulfillment_policy_id || tagMappingPolicies?.fulfillment_policy_id || storeConfig.default_fulfillment_policy_id || ''
  const paymentPolicyId = template?.payment_policy_id || tagMappingPolicies?.payment_policy_id || storeConfig.default_payment_policy_id || ''
  const returnPolicyId = template?.return_policy_id || tagMappingPolicies?.return_policy_id || storeConfig.default_return_policy_id || ''

  let aspects = await buildCategoryAwareAspects(supabase, item, detectedCategory)

  if (isGraded) {
    const gradingAspects: Record<string, string[]> = {}
    if (item.grading_company) gradingAspects['Professional Grader'] = [item.grading_company]
    if (item.grade) gradingAspects['Grade'] = [item.grade]
    const certNumber = item.psa_cert || item.cgc_cert
    if (certNumber) gradingAspects['Certification Number'] = [certNumber]
    gradingAspects['Graded'] = ['Yes']
    aspects = { ...aspects, ...gradingAspects }
  }

  const gradingAspectKeys = ['Professional Grader', 'Grade', 'Certification Number', 'Graded']
  const preValidationGradingAspects = isGraded ? gradingAspectKeys.filter(k => aspects[k]) : []
  const { validated: validatedAspects, warnings: aspectWarnings } = validateAspects(schema, aspects)
  aspects = validatedAspects
  if (aspectWarnings.length > 0) {
    console.log(`[ebay-sync-processor] Update aspect warnings for ${categoryId}: ${aspectWarnings.join('; ')}`)
  }

  let descriptionSuffix = ''
  if (isGraded && preValidationGradingAspects.length > 0) {
    const removedGradingKeys = preValidationGradingAspects.filter(k => !validatedAspects[k])
    if (removedGradingKeys.length > 0) {
      const grader = item.grading_company || template?.default_grader || ''
      const grade = item.grade || ''
      const cert = item.psa_cert || item.cgc_cert || ''
      const parts = [grader, grade].filter(Boolean).join(' ')
      descriptionSuffix = cert ? `\n<p><strong>Grading:</strong> ${parts} — Cert #${cert}</p>` : `\n<p><strong>Grading:</strong> ${parts}</p>`
      console.log(`[ebay-sync-processor] Update: Grading aspects removed by taxonomy, appended to description: ${removedGradingKeys.join(', ')}`)
    }
  }

  let conditionDescriptors: any[] | undefined
  if (isGraded) {
    if (isComicCategory) {
      conditionDescriptors = buildComicConditionDescriptors(
        item.grading_company || template?.default_grader || 'CGC', item.grade, item.cgc_cert || item.psa_cert
      )
    } else {
      conditionDescriptors = buildGradedConditionDescriptors(
        item.grading_company || template?.default_grader || 'PSA', item.grade, item.psa_cert || item.cgc_cert
      )
    }
  }

  // DRY RUN
  if (isDryRun) {
    console.log(`[ebay-sync-processor] DRY RUN: Would update listing for SKU ${ebaySku}`)
    await supabase.from('intake_items').update({
      ebay_sync_status: 'dry_run', ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(), action: 'update', dry_run: true, simulated: true,
        sku: ebaySku, template_id: template?.id,
      },
    }).eq('id', item.id)
    return { success: true }
  }

  // Full inventory item update
  const inventoryPayload: any = {
    sku: ebaySku,
    product: {
      title: buildTitle(item, template?.title_template).substring(0, 80),
      description: buildDescription(item, template?.description_template) + descriptionSuffix,
      aspects, imageUrls: item.image_urls || [],
    },
    condition: conditionIdToEnum(conditionId),
    availability: { shipToLocationAvailability: { quantity } },
  }
  if (conditionDescriptors?.length) inventoryPayload.conditionDescriptors = conditionDescriptors

  const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, inventoryPayload)
  if (!inventoryResult.success) return inventoryResult

  const basePrice = item.price || 0
  const markupPercent = template?.price_markup_percent ?? tagMappingPolicies?.price_markup_percent ?? 0
  const finalPrice = basePrice * (1 + markupPercent / 100)

  if (item.ebay_offer_id) {
    const offerUpdateResult = await updateOffer(accessToken, environment, item.ebay_offer_id, {
      sku: ebaySku, marketplaceId, format: 'FIXED_PRICE',
      availableQuantity: quantity,
      pricingSummary: { price: { value: finalPrice.toFixed(2), currency: 'USD' } },
      listingPolicies: {
        fulfillmentPolicyId, paymentPolicyId, returnPolicyId,
        ...(template?.best_offer_enabled ? {
          bestOfferTerms: {
            bestOfferEnabled: true,
            ...(template.auto_accept_price != null ? { autoAcceptPrice: { value: template.auto_accept_price.toFixed(2), currency: 'USD' } } : {}),
            ...(template.auto_decline_percent != null ? { autoDeclinePrice: { value: (finalPrice * template.auto_decline_percent / 100).toFixed(2), currency: 'USD' } } : {}),
          },
        } : {}),
      },
      categoryId,
      merchantLocationKey: storeConfig.location_key || undefined,
    })
    if (!offerUpdateResult.success) return offerUpdateResult
  }

  await supabase.from('intake_items').update({
    ebay_sync_status: 'synced', ebay_sync_error: null,
    last_ebay_synced_at: new Date().toISOString(),
    ebay_sync_snapshot: {
      timestamp: new Date().toISOString(), action: 'update', sku: ebaySku,
      template_id: template?.id, category_id: categoryId,
      fulfillment_policy_id: fulfillmentPolicyId, payment_policy_id: paymentPolicyId, return_policy_id: returnPolicyId,
    },
  }).eq('id', item.id)

  return { success: true }
}

// ─── Delete Flow ─────────────────────────────────────────────────

async function processDelete(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: any,
  isDryRun: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const ebaySku = item.ebay_inventory_item_sku
  if (!ebaySku) return { success: true }

  if (isDryRun) {
    console.log(`[ebay-sync-processor] DRY RUN: Would delete listing for SKU ${ebaySku}`)
    await supabase.from('intake_items').update({
      ebay_inventory_item_sku: null, ebay_offer_id: null, ebay_listing_id: null, ebay_listing_url: null,
      ebay_sync_status: 'dry_run', ebay_sync_error: null,
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(), action: 'delete', dry_run: true, simulated: true, deleted_sku: ebaySku,
      },
    }).eq('id', item.id)
    return { success: true }
  }

  const result = await deleteInventoryItem(accessToken, environment, ebaySku)

  if (result.success) {
    await supabase.from('intake_items').update({
      ebay_inventory_item_sku: null, ebay_offer_id: null, ebay_listing_id: null, ebay_listing_url: null,
      ebay_sync_status: null, ebay_sync_error: null,
      ebay_sync_snapshot: { timestamp: new Date().toISOString(), action: 'delete', deleted_sku: ebaySku },
    }).eq('id', item.id)
  }

  return result
}

// ─── Error Handling ──────────────────────────────────────────────

async function markQueueItemFailed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  itemId: string,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  if (retryCount < MAX_RETRIES) {
    await Promise.all([
      supabase.from('ebay_sync_queue').update({
        status: 'queued',
        retry_count: retryCount + 1,
        error_message: errorMessage,
        retry_after: new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', queueId),
      supabase.from('intake_items').update({
        ebay_sync_status: 'error',
        ebay_sync_error: `[Retry ${retryCount + 1}/${MAX_RETRIES}] ${errorMessage}`,
      }).eq('id', itemId),
    ])
  } else {
    await Promise.all([
      supabase.from('ebay_sync_queue').update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', queueId),
      supabase.from('intake_items').update({
        ebay_sync_status: 'error',
        ebay_sync_error: errorMessage,
      }).eq('id', itemId),
    ])
  }
}

/** Batch-fail all items for a store (e.g. token error) */
async function batchMarkFailed(
  supabase: ReturnType<typeof createClient>,
  queueIds: string[],
  itemIds: string[],
  errorMessage: string,
  storeItems: QueueItem[]
): Promise<void> {
  // Split into retriable vs permanent failures
  const retriable = storeItems.filter(i => (i.retry_count || 0) < MAX_RETRIES)
  const permanent = storeItems.filter(i => (i.retry_count || 0) >= MAX_RETRIES)

  if (retriable.length > 0) {
    await supabase.from('ebay_sync_queue').update({
      status: 'queued',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    }).in('id', retriable.map(i => i.id))
  }

  if (permanent.length > 0) {
    await supabase.from('ebay_sync_queue').update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).in('id', permanent.map(i => i.id))
  }

  if (itemIds.length > 0) {
    await supabase.from('intake_items').update({
      ebay_sync_status: 'error',
      ebay_sync_error: errorMessage,
    }).in('id', itemIds)
  }
}
