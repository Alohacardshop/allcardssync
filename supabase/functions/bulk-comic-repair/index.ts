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

const BATCH_SIZE = 10
const API_VERSION = '2024-07'

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
  status: 'updated' | 'unchanged' | 'failed'
  changes: string[]
  error?: string
  api_calls: number
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
    const itemIds: string[] | null = body.item_ids || null  // optional filter
    const limit: number = body.limit || 500

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
      limit
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

    // ── Query comic items that are already synced ──
    let query = supabase
      .from('intake_items')
      .select('id, sku, brand_title, subject, card_number, variant, year, grade, grading_company, psa_cert, psa_cert_number, category, main_category, sub_category, catalog_snapshot, psa_snapshot, grading_data, image_urls, shopify_product_id, shopify_variant_id, shopify_sync_snapshot, normalized_tags, shopify_tags, primary_category, condition_type, product_weight, cost, cgc_cert')
      .not('shopify_product_id', 'is', null)
      .not('shopify_variant_id', 'is', null)
      .is('deleted_at', null)
      .limit(limit)

    // Filter to comics only
    query = query.or('main_category.eq.comics,catalog_snapshot->>type.eq.graded_comic')

    if (itemIds && itemIds.length > 0) {
      query = query.in('id', itemIds)
    }

    const { data: comicItems, error: queryError } = await query

    if (queryError) throw new Error(`Failed to query comics: ${queryError.message}`)
    if (!comicItems || comicItems.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        mode,
        message: 'No synced comic items found',
        summary: { total_scanned: 0, total_comics: 0, total_changed: 0, total_unchanged: 0, total_failed: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(JSON.stringify({
      event: 'comic_bulk_repair_items_found',
      count: comicItems.length,
      mode
    }))

    // ── Process in batches ──
    const diffs: RepairDiff[] = []
    const results: RepairResult[] = []
    let totalApiCalls = 0

    for (let batchStart = 0; batchStart < comicItems.length; batchStart += BATCH_SIZE) {
      const batch = comicItems.slice(batchStart, batchStart + BATCH_SIZE)

      const batchPromises = batch.map(async (intakeItem: any) => {
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
          image_url: intakeItem.image_url,
          cost: intakeItem.cost,
          price: undefined
        }

        try {
          // Generate intended comic data
          const intendedTitle = buildComicTitle(intakeItem, item)
          const intendedDescription = buildComicDescription(intakeItem, item)
          const intendedComicMetafields = buildComicMetafields(intakeItem, item)
          const frontUrl = determineFrontImageUrl(intakeItem)

          // Fetch current Shopify product
          const productRes = await shopifyFetchWithRetry(
            `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json`,
            { method: 'GET', headers: shopifyHeaders }
          )
          totalApiCalls++

          if (!productRes.ok) {
            const errText = await productRes.text()
            throw new Error(`Shopify fetch failed: ${errText}`)
          }

          const { product: existingProduct } = await productRes.json()

          // Compare
          const titleChanged = existingProduct.title !== intendedTitle
          const descChanged = existingProduct.body_html !== intendedDescription
          const imageChanged = frontUrl ? !productHasCorrectImage(existingProduct, frontUrl) : false

          // Fetch existing metafields for comparison
          let metafieldsChangedCount = 0
          if (mode === 'execute' || mode === 'preview') {
            const mfRes = await shopifyFetchWithRetry(
              `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
              { method: 'GET', headers: shopifyHeaders }
            )
            totalApiCalls++
            if (mfRes.ok) {
              const { metafields: existingMfs } = await mfRes.json()
              const changedMfs = filterChangedMetafields(intendedComicMetafields, existingMfs || [])
              metafieldsChangedCount = changedMfs.length
            }
          }

          const diff: RepairDiff = {
            item_id: intakeItem.id,
            sku: intakeItem.sku,
            current_title: existingProduct.title,
            intended_title: intendedTitle,
            title_changed: titleChanged,
            description_changed: descChanged,
            image_changed: imageChanged,
            metafields_changed: metafieldsChangedCount
          }

          const hasAnyChange = titleChanged || descChanged || imageChanged || metafieldsChangedCount > 0

          console.log(JSON.stringify({
            event: 'comic_bulk_repair_item_diff',
            item_id: intakeItem.id,
            sku: intakeItem.sku,
            title_changed: titleChanged,
            description_changed: descChanged,
            image_changed: imageChanged,
            metafields_changed: metafieldsChangedCount,
            has_change: hasAnyChange
          }))

          if (mode === 'preview') {
            diffs.push(diff)
            return
          }

          // ── Execute mode ──
          if (!hasAnyChange) {
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'unchanged', changes: [], api_calls: 0 })
            return
          }

          const changes: string[] = []
          let itemApiCalls = 0

          // Update product title + description
          if (titleChanged || descChanged) {
            const productUpdate: any = { id: intakeItem.shopify_product_id }
            if (titleChanged) productUpdate.title = intendedTitle
            if (descChanged) productUpdate.body_html = intendedDescription

            const updateRes = await shopifyFetchWithRetry(
              `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json`,
              { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ product: productUpdate }) }
            )
            itemApiCalls++
            totalApiCalls++

            if (!updateRes.ok) {
              const errText = await updateRes.text()
              throw new Error(`Product update failed: ${errText}`)
            }

            if (titleChanged) changes.push('title')
            if (descChanged) changes.push('description')

            console.log(JSON.stringify({
              event: 'comic_bulk_repair_item_updated',
              item_id: intakeItem.id,
              sku: intakeItem.sku,
              changes: changes.filter(c => c === 'title' || c === 'description')
            }))
          }

          // Repair image
          if (imageChanged && frontUrl) {
            const mediaResult = await ensureMediaOrder({
              domain, token,
              productId: intakeItem.shopify_product_id,
              intendedFrontUrl: frontUrl
            })
            itemApiCalls++
            totalApiCalls++

            if (mediaResult.success) {
              changes.push('image')
              console.log(JSON.stringify({
                event: 'comic_bulk_repair_image_repaired',
                item_id: intakeItem.id,
                sku: intakeItem.sku,
                front_url: frontUrl
              }))
            } else {
              console.warn(JSON.stringify({
                event: 'comic_bulk_repair_image_failed',
                item_id: intakeItem.id,
                message: mediaResult.message
              }))
            }
          }

          // Write changed metafields
          if (metafieldsChangedCount > 0) {
            const mfRes2 = await shopifyFetchWithRetry(
              `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
              { method: 'GET', headers: shopifyHeaders }
            )
            totalApiCalls++
            itemApiCalls++

            if (mfRes2.ok) {
              const { metafields: existingMfs } = await mfRes2.json()
              const toWrite = filterChangedMetafields(intendedComicMetafields, existingMfs || [])

              for (const mf of toWrite) {
                const mfWriteRes = await shopifyFetchWithRetry(
                  `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}/metafields.json`,
                  { method: 'POST', headers: shopifyHeaders, body: JSON.stringify({ metafield: mf }) }
                )
                itemApiCalls++
                totalApiCalls++
                if (!mfWriteRes.ok) {
                  const t = await mfWriteRes.text()
                  console.warn(`Metafield write failed for ${mf.key}: ${t}`)
                }
              }
              changes.push(`${toWrite.length} metafields`)
            }
          }

          // Update intake item sync snapshot
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
              item_id: intakeItem.id,
              sku: intakeItem.sku,
              current_title: null,
              intended_title: '',
              title_changed: false,
              description_changed: false,
              image_changed: false,
              metafields_changed: 0,
              error: err.message
            })
          } else {
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, status: 'failed', changes: [], error: err.message, api_calls: 0 })
          }
        }
      })

      await Promise.all(batchPromises)

      console.log(JSON.stringify({
        event: 'comic_bulk_repair_batch_complete',
        batch: Math.floor(batchStart / BATCH_SIZE) + 1,
        processed: Math.min(batchStart + BATCH_SIZE, comicItems.length),
        total: comicItems.length
      }))
    }

    const totalMs = totalTimer()

    if (mode === 'preview') {
      const withChanges = diffs.filter(d => d.title_changed || d.description_changed || d.image_changed || d.metafields_changed > 0)
      const withErrors = diffs.filter(d => d.error)

      console.log(JSON.stringify({
        event: 'comic_bulk_repair_preview_completed',
        total_scanned: comicItems.length,
        total_comics: comicItems.length,
        total_needing_repair: withChanges.length,
        total_unchanged: comicItems.length - withChanges.length - withErrors.length,
        total_errors: withErrors.length,
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
          duration_ms: totalMs,
          api_calls: totalApiCalls
        },
        diffs
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Execute summary
    const updated = results.filter(r => r.status === 'updated').length
    const unchanged = results.filter(r => r.status === 'unchanged').length
    const failed = results.filter(r => r.status === 'failed').length

    console.log(JSON.stringify({
      event: 'comic_bulk_repair_completed',
      total_scanned: comicItems.length,
      total_comics: comicItems.length,
      total_changed: updated,
      total_unchanged: unchanged,
      total_failed: failed,
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
        duration_ms: totalMs,
        api_calls: totalApiCalls
      },
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
