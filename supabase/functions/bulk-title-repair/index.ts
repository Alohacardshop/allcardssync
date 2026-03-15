import { corsHeaders } from '../_shared/cors.ts'
import {
  buildUnifiedTitle,
  buildUnifiedDescription,
  isGradedItem,
  isComicItem,
  shopifyFetchWithRetry,
  timer
} from '../_shared/shopify-sync-core.ts'

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
  item_type: string
  current_title: string | null
  intended_title: string
  title_changed: boolean
  description_changed: boolean
  error?: string
}

interface RepairResult {
  item_id: string
  sku: string | null
  item_type: string
  status: 'updated' | 'unchanged' | 'failed' | 'skipped'
  changes: string[]
  error?: string
  api_calls: number
}

function classifyItem(intakeItem: any): string {
  const comic = isComicItem(intakeItem)
  const graded = isGradedItem(intakeItem)
  if (comic && graded) return 'graded_comic'
  if (comic) return 'raw_comic'
  if (graded) return 'graded_card'
  return 'raw_card'
}

async function shopifyCallWithPacing(url: string, init: RequestInit): Promise<Response> {
  const res = await shopifyFetchWithRetry(url, init)
  await pace()
  if (res.status === 429) {
    const retryAfter = res.headers?.get?.('Retry-After')
    const wait = retryAfter ? Math.max(parseInt(retryAfter) * 1000, BACKOFF_MS) : BACKOFF_MS
    await pace(wait)
    const retryRes = await shopifyFetchWithRetry(url, init)
    await pace()
    return retryRes
  }
  return res
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
    const limit: number = body.limit || 100
    const afterId: string | null = body.after_id || null
    const skipRepaired: boolean = body.skip_repaired !== false
    const categoryFilter: string | null = body.category_filter || null // 'comics', 'tcg', or null for all
    const typeFilter: string | null = body.type_filter || null // 'graded', 'raw', or null for all

    if (!storeKey) {
      return new Response(JSON.stringify({ success: false, error: 'store_key is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(JSON.stringify({
      event: 'bulk_title_repair_started',
      mode, store_key: storeKey, limit, after_id: afterId,
      category_filter: categoryFilter, type_filter: typeFilter
    }))

    // Fetch Shopify credentials
    const storeUpper = storeKey.toUpperCase()
    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])
    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value
    if (!domain || !token) throw new Error(`Missing Shopify credentials for ${storeKey}`)

    const shopifyHeaders = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }

    // Query synced items
    let query = supabase
      .from('intake_items')
      .select('id, sku, brand_title, subject, card_number, variant, year, grade, grading_company, psa_cert, psa_cert_number, cgc_cert, category, main_category, sub_category, catalog_snapshot, psa_snapshot, type, shopify_product_id, shopify_variant_id, updated_by')
      .not('shopify_product_id', 'is', null)
      .not('shopify_variant_id', 'is', null)
      .is('deleted_at', null)
      .eq('store_key', storeKey)
      .order('id', { ascending: true })
      .limit(limit)

    if (categoryFilter) {
      query = query.eq('main_category', categoryFilter)
    }
    if (typeFilter === 'graded') {
      query = query.not('grade', 'is', null)
    } else if (typeFilter === 'raw') {
      query = query.is('grade', null)
    }
    if (skipRepaired) {
      query = query.neq('updated_by', 'bulk_title_repair')
    }
    if (afterId) {
      query = query.gt('id', afterId)
    }

    const { data: items, error: queryError } = await query
    if (queryError) throw new Error(`Query failed: ${queryError.message}`)

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({
        success: true, mode,
        message: 'No items found matching filters',
        summary: { total_scanned: 0, total_changed: 0, total_unchanged: 0, total_failed: 0, total_skipped: 0, total_rate_limited: 0, duration_ms: totalTimer(), api_calls: 0 },
        pagination: { has_more: false, next_cursor: null }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(JSON.stringify({ event: 'bulk_title_repair_items_found', count: items.length, mode }))

    // Process
    const diffs: RepairDiff[] = []
    const results: RepairResult[] = []
    let totalApiCalls = 0
    let totalRateLimited = 0
    let lastProcessedId: string | null = null

    for (let i = 0; i < items.length; i++) {
      const intakeItem = items[i] as any
      lastProcessedId = intakeItem.id
      const itemType = classifyItem(intakeItem)

      if (i > 0 && i % PROGRESS_INTERVAL === 0) {
        console.log(JSON.stringify({ event: 'bulk_title_repair_progress', processed: i, total: items.length, duration_ms: totalTimer() }))
      }

      try {
        const intendedTitle = buildUnifiedTitle(intakeItem)
        const intendedDescription = buildUnifiedDescription(intakeItem)

        // Fetch current Shopify product
        const productRes = await shopifyCallWithPacing(
          `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json?fields=id,title,body_html`,
          { method: 'GET', headers: shopifyHeaders }
        )
        totalApiCalls++

        if (productRes.status === 429) {
          totalRateLimited++
          if (mode === 'preview') {
            diffs.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, current_title: null, intended_title: intendedTitle, title_changed: false, description_changed: false, error: 'Rate limited' })
          } else {
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'skipped', changes: [], error: 'Rate limited', api_calls: 1 })
          }
          await pace(BACKOFF_MS)
          continue
        }

        if (productRes.status === 404) {
          if (mode === 'preview') {
            diffs.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, current_title: null, intended_title: intendedTitle, title_changed: false, description_changed: false, error: 'Product not found (404)' })
          } else {
            results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'failed', changes: [], error: '404 - product missing', api_calls: 1 })
          }
          continue
        }

        if (!productRes.ok) {
          const errText = await productRes.text()
          throw new Error(`Shopify fetch ${productRes.status}: ${errText}`)
        }

        const { product } = await productRes.json()
        const titleChanged = product.title !== intendedTitle
        const descChanged = product.body_html !== intendedDescription

        if (mode === 'preview') {
          diffs.push({
            item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType,
            current_title: product.title, intended_title: intendedTitle,
            title_changed: titleChanged, description_changed: descChanged
          })
          continue
        }

        // Execute mode
        if (!titleChanged && !descChanged) {
          // Mark as repaired even if unchanged so skip works
          await supabase.from('intake_items').update({
            updated_by: 'bulk_title_repair',
            updated_at: new Date().toISOString()
          }).eq('id', intakeItem.id)
          results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'unchanged', changes: [], api_calls: 1 })
          continue
        }

        const productUpdate: any = { id: intakeItem.shopify_product_id }
        if (titleChanged) productUpdate.title = intendedTitle
        if (descChanged) productUpdate.body_html = intendedDescription

        const updateRes = await shopifyCallWithPacing(
          `https://${domain}/admin/api/${API_VERSION}/products/${intakeItem.shopify_product_id}.json`,
          { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ product: productUpdate }) }
        )
        totalApiCalls++

        if (updateRes.status === 429) {
          totalRateLimited++
          results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'skipped', changes: [], error: 'Rate limited on update', api_calls: 2 })
          await pace(BACKOFF_MS)
          continue
        }

        if (!updateRes.ok) {
          const errText = await updateRes.text()
          results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'failed', changes: [], error: `Update failed: ${errText}`, api_calls: 2 })
          continue
        }

        const changes: string[] = []
        if (titleChanged) changes.push('title')
        if (descChanged) changes.push('description')

        await supabase.from('intake_items').update({
          updated_by: 'bulk_title_repair',
          last_shopify_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', intakeItem.id)

        results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'updated', changes, api_calls: 2 })

      } catch (err: any) {
        if (mode === 'preview') {
          diffs.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, current_title: null, intended_title: '', title_changed: false, description_changed: false, error: err.message })
        } else {
          results.push({ item_id: intakeItem.id, sku: intakeItem.sku, item_type: itemType, status: 'failed', changes: [], error: err.message, api_calls: 0 })
        }
      }
    }

    const hasMore = items.length === limit
    const duration = totalTimer()

    if (mode === 'preview') {
      const needingRepair = diffs.filter(d => d.title_changed || d.description_changed)
      const errors = diffs.filter(d => d.error)

      console.log(JSON.stringify({
        event: 'bulk_title_repair_completed', mode: 'preview',
        total_scanned: items.length, needing_repair: needingRepair.length,
        errors: errors.length, duration_ms: duration
      }))

      return new Response(JSON.stringify({
        success: true, mode: 'preview',
        diffs,
        summary: {
          total_scanned: items.length,
          total_needing_repair: needingRepair.length,
          total_unchanged: items.length - needingRepair.length - errors.length,
          total_errors: errors.length,
          total_rate_limited: totalRateLimited,
          duration_ms: duration,
          api_calls: totalApiCalls
        },
        pagination: { has_more: hasMore, next_cursor: lastProcessedId }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Execute summary
    const updated = results.filter(r => r.status === 'updated').length
    const unchanged = results.filter(r => r.status === 'unchanged').length
    const failed = results.filter(r => r.status === 'failed').length
    const skipped = results.filter(r => r.status === 'skipped').length

    console.log(JSON.stringify({
      event: 'bulk_title_repair_completed', mode: 'execute',
      total_scanned: items.length, updated, unchanged, failed, skipped,
      duration_ms: duration
    }))

    return new Response(JSON.stringify({
      success: true, mode: 'execute',
      results,
      summary: {
        total_scanned: items.length,
        total_changed: updated,
        total_unchanged: unchanged,
        total_failed: failed,
        total_skipped: skipped,
        total_rate_limited: totalRateLimited,
        duration_ms: duration,
        api_calls: totalApiCalls
      },
      pagination: { has_more: hasMore, next_cursor: lastProcessedId }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error(JSON.stringify({ event: 'bulk_title_repair_error', error: error.message, duration_ms: totalTimer() }))
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
