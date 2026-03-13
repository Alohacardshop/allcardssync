import { corsHeaders } from '../_shared/cors.ts'
import {
  buildComicTitle,
  buildComicDescription,
  buildComicMetafields,
  shopifyFetchWithRetry,
  filterChangedMetafields,
  productHasCorrectImage,
  generateBarcodeForGradedItem,
  timer
} from '../_shared/shopify-sync-core.ts'
import { ensureMediaOrder, determineFrontImageUrl } from '../_shared/shopify-media-order.ts'

const API_VERSION = '2024-07'
const PACE_MS = 300
const BACKOFF_MS = 2000
const PROGRESS_INTERVAL = 10

function pace(ms = PACE_MS) {
  return new Promise(r => setTimeout(r, ms))
}

interface RepairDiff {
  item_id: string
  sku: string | null
  current_title: string | null
  intended_title: string
  title_changed: boolean
  description_changed: boolean
  image_changed: boolean
  metafields_changed: number
  error?: string
}

interface RepairResult {
  item_id: string
  sku: string | null
  status: 'updated' | 'unchanged' | 'failed' | 'skipped'
  changes: string[]
  error?: string
  api_calls: number
}

async function shopifyCallWithPacing(
  url: string,
  init: RequestInit,
  _domain: string,
  _token: string
): Promise<Response> {
  const res = await shopifyFetchWithRetry(url, init)
  await pace()

  if (res.status === 429) {
    const retryAfter = res.headers?.get?.('Retry-After')
    const wait = retryAfter ? Math.max(parseInt(retryAfter) * 1000, BACKOFF_MS) : BACKOFF_MS
    console.log(JSON.stringify({
      event: 'comic_bulk_repair_rate_limited',
      url,
      wait_ms: wait
    }))
    await pace(wait)
    const retryRes = await shopifyFetchWithRetry(url, init)
    await pace()
    return retryRes
  }

  return res
}

// ── Helper: count total comics eligible for repair ──
async function countTotalComics(supabase: any, storeFilter?: string): Promise<number> {
  let q = supabase
    .from('intake_items')
    .select('id', { count: 'exact', head: true })
    .not('shopify_product_id', 'is', null)
    .not('shopify_variant_id', 'is', null)
    .is('deleted_at', null)
    .eq('main_category', 'comics')

  if (storeFilter) {
    q = q.eq('store_key', storeFilter)
  }

  const { count } = await q
  return count ?? 0
}

async function countRepairedComics(supabase: any, storeFilter?: string): Promise<number> {
  // Count comics that have a repair_timestamp in their snapshot
  // We approximate by checking updated_by = 'comic_bulk_repair'
  let q = supabase
    .from('intake_items')
    .select('id', { count: 'exact', head: true })
    .not('shopify_product_id', 'is', null)
    .not('shopify_variant_id', 'is', null)
    .is('deleted_at', null)
    .eq('main_category', 'comics')
    .eq('updated_by', 'comic_bulk_repair')

  if (storeFilter) {
    q = q.eq('store_key', storeFilter)
  }

  const { count } = await q
  return count ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const totalTimer = timer()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const mode: 'preview' | 'execute' = body.mode || 'preview'
    const storeKey: string = body.store_key
    const itemIds: string[] | null = body.item_ids || null
    const limit: number = body.limit || 200
    const afterId: string | null = body.after_id || null          // cursor: resume after this item id
    const skipRepaired: boolean = body.skip_repaired !== false     // default true: skip already-repaired items
    const storeFilter: string | null = body.store_filter || null  // optional: filter by store_key on items
    const forceImage: boolean = body.force_image === true          // force delete+re-upload image on every item

    if (!storeKey) {
      return new Response(JSON.stringify({ success: false, error: 'store_key is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(JSON.stringify({
      event: 'comic_bulk_repair_started',
      mode,
      store_key: storeKey,
      item_ids_count: itemIds?.length || 'all',
      limit,
      after_id: afterId,
      skip_repaired: skipRepaired
    }))

    // ── Fetch Shopify credentials ──
    const storeUpper = storeKey.toUpperCase()
    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])
    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value
    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for store ${storeKey}`)
    }

    const shopifyHeaders = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }

    // ── Count totals for remaining estimate ──
    const [totalComics, repairedComics] = await Promise.all([
      countTotalComics(supabase, storeFilter),
      countRepairedComics(supabase, storeFilter)
    ])

    // ── Query comic items that are already synced ──
    let query = supabase
      .from('intake_items')
      .select('id, sku, brand_title, subject, card_number, variant, year, grade, grading_company, psa_cert, psa_cert_number, category, main_category, sub_category, catalog_snapshot, psa_snapshot, grading_data, image_urls, front_image_url, back_image_url, shopify_product_id, shopify_variant_id, shopify_sync_snapshot, normalized_tags, shopify_tags, primary_category, condition_type, product_weight, cost, cgc_cert, updated_by')
      .not('shopify_product_id', 'is', null)
      .not('shopify_variant_id', 'is', null)
      .is('deleted_at', null)
      .eq('main_category', 'comics')
      .order('id', { ascending: true })
      .limit(limit)

    if (storeFilter) {
      query = query.eq('store_key', storeFilter)
    }

    // Skip already-repaired items
    if (skipRepaired) {
      query = query.neq('updated_by', 'comic_bulk_repair')
    }

    // Cursor-based pagination: fetch items with id > after_id
    if (afterId) {
      query = query.gt('id', afterId)
    }

    if (itemIds && itemIds.length > 0) {
      query = query.in('id', itemIds)
    }

    const { data: comicItems, error: queryError } = await query

    if (queryError) throw new Error(`Failed to query comics: ${queryError.message}`)

    const remainingEstimate = totalComics - repairedComics

    if (!comicItems || comicItems.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        mode,
        message: remainingEstimate <= 0
          ? 'All comics have been repaired!'
          : 'No unrepaired comic items found in this batch (try without after_id or with skip_repaired=false)',
        summary: {
          total_scanned: 0, total_comics: 0, total_changed: 0,
          total_unchanged: 0, total_failed: 0, total_skipped: 0,
          total_rate_limited: 0,
          total_in_catalog: totalComics,
          total_already_repaired: repairedComics,
          total_remaining: remainingEstimate
        },
        pagination: { has_more: false, next_cursor: null }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(JSON.stringify({
      event: 'comic_bulk_repair_items_found',
      count: comicItems.length,
      mode,
      total_in_catalog: totalComics,
      total_already_repaired: repairedComics,
      remaining_estimate: remainingEstimate
    }))

    // ── Process items sequentially ──
    const diffs: RepairDiff[] = []
    const results: RepairResult[] = []
    let totalApiCalls = 0
    let totalRateLimited = 0
    let totalSkipped = 0
    let lastProcessedId: string | null = null

    for (let i = 0; i < comicItems.length; i++) {
      const intakeItem = comicItems[i] as any
      lastProcessedId = intakeItem.id

      if (i > 0 && i % PROGRESS_INTERVAL === 0) {
        console.log(JSON.stringify({
          event: 'comic_bulk_repair_progress',
          processed: i,
          total: comicItems.length,
          mode,
          duration_ms: totalTimer()
        }))
      }

      const item = {
        id: intakeItem.id,
        sku: intakeItem.sku,
        psa_cert: intakeItem.psa_cert || intakeItem.psa_cert_number,
        brand_title: intakeItem.brand_title,
        subject: intakeItem.subject,
        card_number: intakeItem.card_number,
        variant: intakeItem.variant,
        year: intakeItem.year,
        grade: intakeItem.grade,
        category_tag: intakeItem.category,
        image_url: Array.isArray(intakeItem.image_urls) ? intakeItem.image_urls[0] : '',
        cost: intakeItem.cost,
        price: undefined
      }

      try {
        const intendedTitle = buildComicTitle(intakeItem, item)
        const intendedDescription = buildComicDescription(intakeItem, item)
        const intendedComicMetafields = buildComicMetafields(intakeItem, item)
        const frontUrl = determineFrontImageUrl(intakeItem)

        // Fetch current Shopify product
        const productRes = await shopifyCallWithPacing(
          `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json`,
          { method: 'GET', headers: shopifyHeaders },
          domain, token
        )
        totalApiCalls++

        if (productRes.status === 429) {
          totalRateLimited++
          totalSkipped++
          if (mode === 'preview') {
            diffs.push({
              item_id: intakeItem.id, sku: intakeItem.sku,
              current_title: null, intended_title: intendedTitle,
              title_changed: false, description_changed: false,
              image_changed: false, metafields_changed: 0,
              error: 'Rate limited - skipped'
            })
          } else {
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'skipped', changes: [], error: 'Rate limited after backoff', api_calls: 1 })
          }
          console.log(JSON.stringify({ event: 'comic_bulk_repair_backoff', item_id: intakeItem.id, sku: intakeItem.sku }))
          await pace(BACKOFF_MS)
          continue
        }

        if (productRes.status === 404) {
          // Product no longer exists in Shopify — clean up stale references
          console.log(JSON.stringify({
            event: 'comic_bulk_repair_stale_cleanup',
            item_id: intakeItem.id,
            sku: intakeItem.sku,
            shopify_product_id: intakeItem.shopify_product_id,
            mode
          }))

          if (mode === 'preview') {
            diffs.push({
              item_id: intakeItem.id, sku: intakeItem.sku,
              current_title: null, intended_title: intendedTitle,
              title_changed: true, description_changed: false,
              image_changed: false, metafields_changed: 0,
              error: 'Shopify product not found (404) — will clean stale link on execute'
            })
          } else {
            // Only mutate in execute mode
            await supabase.from('intake_items').update({
              shopify_product_id: null,
              shopify_variant_id: null,
              shopify_inventory_item_id: null,
              shopify_sync_status: null,
              updated_by: 'comic_bulk_repair_cleanup',
              updated_at: new Date().toISOString()
            }).eq('id', intakeItem.id)
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'updated', changes: ['cleaned_stale_shopify_link'], api_calls: 1 })
          }
          continue
        }

        if (!productRes.ok) {
          const errText = await productRes.text()
          throw new Error(`Shopify fetch failed (${productRes.status}): ${errText}`)
        }

        const { product: existingProduct } = await productRes.json()

        const titleChanged = existingProduct.title !== intendedTitle
        const descChanged = existingProduct.body_html !== intendedDescription
        const imageChanged = frontUrl ? !productHasCorrectImage(existingProduct, frontUrl) : false

        let metafieldsChangedCount = 0
        const mfRes = await shopifyCallWithPacing(
          `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
          { method: 'GET', headers: shopifyHeaders },
          domain, token
        )
        totalApiCalls++

        if (mfRes.status === 429) {
          totalRateLimited++
          console.log(JSON.stringify({ event: 'comic_bulk_repair_rate_limited', item_id: intakeItem.id, context: 'metafield_fetch' }))
          await pace(BACKOFF_MS)
        } else if (mfRes.ok) {
          const { metafields: existingMfs } = await mfRes.json()
          const changedMfs = filterChangedMetafields(intendedComicMetafields, existingMfs || [])
          metafieldsChangedCount = changedMfs.length
        }

        const diff: RepairDiff = {
          item_id: intakeItem.id,
          sku: intakeItem.sku,
          current_title: existingProduct.title,
          intended_title: intendedTitle,
          title_changed: titleChanged,
          description_changed: descChanged,
          image_changed: imageChanged || forceImage,
          metafields_changed: metafieldsChangedCount
        }

        // Always check for back image cleanup even if title/desc/metafields unchanged
        const hasTextOrMetaChange = titleChanged || descChanged || metafieldsChangedCount > 0
        const hasAnyChange = hasTextOrMetaChange || imageChanged || forceImage

        if (mode === 'preview') {
          diffs.push(diff)
          continue
        }

        // ── Execute mode ──
        // Even if no text changes, we still run image cleanup below to remove back images

        const changes: string[] = []
        let itemApiCalls = 0

        // Update product title + description
        if (titleChanged || descChanged) {
          const productUpdate: any = { id: intakeItem.shopify_product_id }
          if (titleChanged) productUpdate.title = intendedTitle
          if (descChanged) productUpdate.body_html = intendedDescription

          const updateRes = await shopifyCallWithPacing(
            `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json`,
            { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ product: productUpdate }) },
            domain, token
          )
          itemApiCalls++
          totalApiCalls++

          if (updateRes.status === 429) {
            totalRateLimited++
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'skipped', changes: [], error: 'Rate limited on product update', api_calls: itemApiCalls })
            await pace(BACKOFF_MS)
            continue
          }

          if (!updateRes.ok) {
            const errText = await updateRes.text()
            throw new Error(`Product update failed: ${errText}`)
          }

          if (titleChanged) changes.push('title')
          if (descChanged) changes.push('description')
        }

        // Repair image — replace with new front image if changed (or forced), or clean up non-front media
        if (frontUrl) {
          if (imageChanged || forceImage) {
            // Image URL has changed (e.g. after rescrape) — delete all existing images and upload new one
            console.log(JSON.stringify({
              event: 'comic_bulk_repair_image_replace',
              item_id: intakeItem.id,
              front_url: frontUrl
            }))

            // Delete all existing product images via REST API
            if (existingProduct.images && existingProduct.images.length > 0) {
              for (const img of existingProduct.images) {
                const delRes = await shopifyCallWithPacing(
                  `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/images/${img.id}.json`,
                  { method: 'DELETE', headers: shopifyHeaders },
                  domain, token
                )
                itemApiCalls++
                totalApiCalls++
                if (!delRes.ok && delRes.status !== 404) {
                  console.warn(`[IMAGE REPLACE] Failed to delete image ${img.id}: ${delRes.status}`)
                }
              }
            }

            // Upload new front image
            const imgUploadRes = await shopifyCallWithPacing(
              `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/images.json`,
              {
                method: 'POST',
                headers: shopifyHeaders,
                body: JSON.stringify({ image: { src: frontUrl, alt: intendedTitle, position: 1 } })
              },
              domain, token
            )
            itemApiCalls++
            totalApiCalls++

            if (imgUploadRes.ok) {
              changes.push('image_replaced')
              console.log(JSON.stringify({ event: 'comic_bulk_repair_image_replaced', item_id: intakeItem.id }))
            } else {
              const errText = await imgUploadRes.text()
              console.warn(JSON.stringify({
                event: 'comic_bulk_repair_image_upload_failed',
                item_id: intakeItem.id,
                status: imgUploadRes.status,
                error: errText
              }))
            }
          } else {
            // Image URL matches — just clean up any non-front media
            const mediaResult = await ensureMediaOrder({
              domain, token,
              productId: intakeItem.shopify_product_id,
              intendedFrontUrl: frontUrl,
              deleteNonFront: true
            })
            itemApiCalls++
            totalApiCalls++
            await pace()

            if (mediaResult.success) {
              if (mediaResult.message?.includes('Deleted')) {
                changes.push('removed_back_image')
              }
            }
          }
        }

        // Write changed metafields sequentially
        if (metafieldsChangedCount > 0) {
          const mfRes2 = await shopifyCallWithPacing(
            `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
            { method: 'GET', headers: shopifyHeaders },
            domain, token
          )
          totalApiCalls++
          itemApiCalls++

          if (mfRes2.ok) {
            const { metafields: existingMfs } = await mfRes2.json()
            const toWrite = filterChangedMetafields(intendedComicMetafields, existingMfs || [])
            let mfWritten = 0

            for (const mf of toWrite) {
              const mfWriteRes = await shopifyCallWithPacing(
                `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
                { method: 'POST', headers: shopifyHeaders, body: JSON.stringify({ metafield: mf }) },
                domain, token
              )
              itemApiCalls++
              totalApiCalls++

              if (mfWriteRes.status === 429) {
                totalRateLimited++
                console.log(JSON.stringify({ event: 'comic_bulk_repair_rate_limited', item_id: intakeItem.id, context: 'metafield_write' }))
                await pace(BACKOFF_MS)
                break
              }

              if (!mfWriteRes.ok) {
                const t = await mfWriteRes.text()
                console.warn(`Metafield write failed for ${mf.key}: ${t}`)
              } else {
                mfWritten++
              }
            }
            if (mfWritten > 0) changes.push(`${mfWritten} metafields`)
          }
        }

        // Update intake item sync snapshot + mark as repaired
        const updatedSnapshot = {
          ...(intakeItem.shopify_sync_snapshot || {}),
          product_data: {
            product: {
              title: intendedTitle,
              body_html: intendedDescription,
              product_type: 'Graded Comic'
            }
          },
          repair_timestamp: new Date().toISOString(),
          repair_changes: changes
        }

        await supabase
          .from('intake_items')
          .update({
            shopify_sync_snapshot: updatedSnapshot,
            last_shopify_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: 'comic_bulk_repair'
          })
          .eq('id', intakeItem.id)

        results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'updated', changes, api_calls: itemApiCalls })

      } catch (err: any) {
        console.error(JSON.stringify({
          event: 'comic_bulk_repair_item_error',
          item_id: intakeItem.id,
          sku: intakeItem.sku,
          error: err.message
        }))

        if (mode === 'preview') {
          diffs.push({
            item_id: intakeItem.id, sku: intakeItem.sku,
            current_title: null, intended_title: '',
            title_changed: false, description_changed: false,
            image_changed: false, metafields_changed: 0,
            error: err.message
          })
        } else {
          results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'failed', changes: [], error: err.message, api_calls: 0 })
        }
      }
    }

    const totalMs = totalTimer()
    const hasMore = comicItems.length === limit
    const nextCursor = lastProcessedId

    // Re-count repaired after this run (for execute mode)
    const newRepairedCount = mode === 'execute'
      ? repairedComics + results.filter(r => r.status === 'updated' || r.status === 'unchanged').length
      : repairedComics
    const newRemaining = totalComics - newRepairedCount

    if (mode === 'preview') {
      const withChanges = diffs.filter(d => d.title_changed || d.description_changed || d.image_changed || d.metafields_changed > 0)
      const withErrors = diffs.filter(d => d.error)

      console.log(JSON.stringify({
        event: 'comic_bulk_repair_completed',
        mode: 'preview',
        total_scanned: comicItems.length,
        total_needing_repair: withChanges.length,
        total_unchanged: comicItems.length - withChanges.length - withErrors.length,
        total_errors: withErrors.length,
        total_rate_limited: totalRateLimited,
        total_in_catalog: totalComics,
        total_remaining: remainingEstimate,
        duration_ms: totalMs,
        api_calls: totalApiCalls
      }))

      return new Response(JSON.stringify({
        success: true,
        mode: 'preview',
        summary: {
          total_scanned: comicItems.length,
          total_comics: comicItems.length,
          total_needing_repair: withChanges.length,
          total_unchanged: comicItems.length - withChanges.length - withErrors.length,
          total_errors: withErrors.length,
          total_rate_limited: totalRateLimited,
          total_in_catalog: totalComics,
          total_already_repaired: repairedComics,
          total_remaining: remainingEstimate,
          duration_ms: totalMs,
          api_calls: totalApiCalls
        },
        pagination: { has_more: hasMore, next_cursor: nextCursor },
        diffs
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Execute summary
    const updated = results.filter(r => r.status === 'updated').length
    const unchanged = results.filter(r => r.status === 'unchanged').length
    const failed = results.filter(r => r.status === 'failed').length
    const skipped = results.filter(r => r.status === 'skipped').length

    console.log(JSON.stringify({
      event: 'comic_bulk_repair_completed',
      mode: 'execute',
      total_scanned: comicItems.length,
      total_changed: updated,
      total_unchanged: unchanged,
      total_failed: failed,
      total_skipped: skipped,
      total_rate_limited: totalRateLimited,
      total_in_catalog: totalComics,
      total_remaining: newRemaining,
      has_more: hasMore,
      duration_ms: totalMs,
      api_calls: totalApiCalls
    }))

    return new Response(JSON.stringify({
      success: true,
      mode: 'execute',
      summary: {
        total_scanned: comicItems.length,
        total_comics: comicItems.length,
        total_changed: updated,
        total_unchanged: unchanged,
        total_failed: failed,
        total_skipped: skipped,
        total_rate_limited: totalRateLimited,
        total_in_catalog: totalComics,
        total_already_repaired: newRepairedCount,
        total_remaining: newRemaining,
        duration_ms: totalMs,
        api_calls: totalApiCalls
      },
      pagination: { has_more: hasMore, next_cursor: nextCursor },
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error(JSON.stringify({
      event: 'comic_bulk_repair_error',
      error: error.message,
      duration_ms: totalTimer()
    }))

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
