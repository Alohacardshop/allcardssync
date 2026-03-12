import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { syncGradedItemToShopify, timer, SyncResult } from '../_shared/shopify-sync-core.ts'

const MAX_ITEMS = 100
const DEFAULT_CONCURRENCY = 5

/**
 * Worker pool: process items with controlled concurrency.
 * Runs up to `concurrency` items in parallel, never more.
 */
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<SyncResult>
): Promise<SyncResult[]> {
  const results: SyncResult[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++
      results[idx] = await fn(items[idx])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const totalTimer = timer()

  try {
    // 1. Auth
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    // 2. Parse input
    const body = await req.json()
    const { item_ids, storeKey, locationGid, vendor, concurrency } = body

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'item_ids must be a non-empty array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (item_ids.length > MAX_ITEMS) {
      return new Response(JSON.stringify({ success: false, error: `Maximum ${MAX_ITEMS} items per batch` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!storeKey || !locationGid) {
      return new Response(JSON.stringify({ success: false, error: 'storeKey and locationGid are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Verify store access
    await requireStoreAccess(user.id, storeKey, locationGid)

    const batchId = crypto.randomUUID().slice(0, 8)
    const effectiveConcurrency = Math.min(Math.max(concurrency || DEFAULT_CONCURRENCY, 1), 10)

    console.log(JSON.stringify({
      event: 'bulk_shopify_sync_start',
      batch_id: batchId,
      total_items: item_ids.length,
      store: storeKey,
      concurrency: effectiveConcurrency,
      triggered_by: user.id
    }))

    // 4. Initialize Supabase + Shopify credentials (once for all items)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const storeUpper = storeKey.toUpperCase()
    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])

    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // 5. Fetch all intake items in one query
    const { data: intakeItems, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, sku, price, cost, psa_cert, grade, year, brand_title, subject, card_number, variant, category, image_url')
      .in('id', item_ids)

    if (fetchError) {
      throw new Error(`Failed to fetch intake items: ${fetchError.message}`)
    }

    // Build a map for quick lookup
    const itemMap = new Map((intakeItems || []).map((i: any) => [i.id, i]))

    // Build SyncItemInput for each id
    const syncItems = item_ids.map((id: string) => {
      const dbItem = itemMap.get(id)
      return {
        id,
        sku: dbItem?.sku,
        psa_cert: dbItem?.psa_cert,
        title: undefined, // let helper auto-generate
        price: dbItem?.price,
        grade: dbItem?.grade,
        year: dbItem?.year,
        brand_title: dbItem?.brand_title,
        subject: dbItem?.subject,
        card_number: dbItem?.card_number,
        variant: dbItem?.variant,
        category_tag: dbItem?.category,
        image_url: dbItem?.image_url,
        cost: dbItem?.cost
      }
    })

    const ctx = { domain, token, storeKey, locationGid, vendor, userId: user.id, supabase }

    // 6. Process with worker pool
    const results = await processWithConcurrency(syncItems, effectiveConcurrency, async (syncItem) => {
      const itemId = syncItem.id

      console.log(JSON.stringify({
        event: 'bulk_shopify_sync_item_start',
        batch_id: batchId,
        item_id: itemId
      }))

      const result = await syncGradedItemToShopify(syncItem, ctx)

      if (result.success) {
        console.log(JSON.stringify({
          event: 'bulk_shopify_sync_item_complete',
          batch_id: batchId,
          item_id: itemId,
          shopify_product_id: result.shopify_product_id,
          api_calls: result.api_calls,
          duration_ms: result.duration_ms
        }))
      } else {
        console.error(JSON.stringify({
          event: 'bulk_shopify_sync_item_error',
          batch_id: batchId,
          item_id: itemId,
          error: result.error,
          duration_ms: result.duration_ms
        }))
      }

      return result
    })

    // 7. Build summary
    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalApiCalls = results.reduce((sum, r) => sum + r.api_calls, 0)
    const totalMs = totalTimer()

    console.log(JSON.stringify({
      event: 'bulk_shopify_sync_complete',
      batch_id: batchId,
      total_items: item_ids.length,
      succeeded,
      failed,
      total_api_calls: totalApiCalls,
      total_duration_ms: totalMs
    }))

    return new Response(JSON.stringify({
      success: failed === 0,
      batch_id: batchId,
      summary: {
        total_items: item_ids.length,
        succeeded,
        failed,
        total_api_calls: totalApiCalls,
        total_duration_ms: totalMs
      },
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({
      event: 'bulk_shopify_sync_error',
      error: error.message,
      total_duration_ms: totalTimer()
    }))

    let status = 500
    if (error.message?.includes('Authorization') || error.message?.includes('authentication')) status = 401
    else if (error.message?.includes('permissions') || error.message?.includes('Access denied')) status = 403
    else if (error.message?.includes('Invalid') || error.message?.includes('validation')) status = 400

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
