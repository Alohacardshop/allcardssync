import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { syncGradedItemToShopify, timer, SyncResult } from '../_shared/shopify-sync-core.ts'

const MAX_ITEMS = 100
const DEFAULT_CONCURRENCY = 5

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
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

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

    await requireStoreAccess(user.id, storeKey, locationGid)

    const batchId = crypto.randomUUID().slice(0, 8)
    const effectiveConcurrency = Math.min(Math.max(concurrency || DEFAULT_CONCURRENCY, 1), 10)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create sync run record
    const { data: runRecord } = await supabase
      .from('shopify_sync_runs')
      .insert({
        batch_id: batchId,
        mode: 'bulk',
        store_key: storeKey,
        total_items: item_ids.length,
        triggered_by: user.id,
        status: 'running'
      })
      .select('id')
      .single()

    const runId = runRecord?.id

    console.log(JSON.stringify({
      event: 'bulk_shopify_sync_start',
      batch_id: batchId,
      run_id: runId,
      total_items: item_ids.length,
      store: storeKey,
      concurrency: effectiveConcurrency,
      triggered_by: user.id
    }))

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

    const { data: intakeItems, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, sku, price, cost, psa_cert, grade, year, brand_title, subject, card_number, variant, category, image_url')
      .in('id', item_ids)

    if (fetchError) {
      throw new Error(`Failed to fetch intake items: ${fetchError.message}`)
    }

    const itemMap = new Map((intakeItems || []).map((i: any) => [i.id, i]))

    const syncItems = item_ids.map((id: string) => {
      const dbItem = itemMap.get(id)
      return {
        id,
        sku: dbItem?.sku,
        psa_cert: dbItem?.psa_cert,
        title: undefined,
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

    const results = await processWithConcurrency(syncItems, effectiveConcurrency, async (syncItem) => {
      const result = await syncGradedItemToShopify(syncItem, ctx)

      // Persist item result
      if (runId) {
        await supabase.from('shopify_sync_run_items').insert({
          run_id: runId,
          item_id: syncItem.id,
          sku: syncItem.sku,
          title: syncItem.title,
          success: result.success,
          error: result.error,
          shopify_product_id: result.shopify_product_id,
          shopify_variant_id: result.shopify_variant_id,
          api_calls: result.api_calls,
          duration_ms: result.duration_ms
        })
      }

      return result
    })

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalApiCalls = results.reduce((sum, r) => sum + r.api_calls, 0)
    const totalMs = totalTimer()

    // Update run summary
    if (runId) {
      const status = failed === 0 ? 'completed' : succeeded === 0 ? 'failed' : 'partial_failure'
      await supabase.from('shopify_sync_runs').update({
        succeeded,
        failed,
        total_api_calls: totalApiCalls,
        total_duration_ms: totalMs,
        status
      }).eq('id', runId)
    }

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
      run_id: runId,
      summary: { total_items: item_ids.length, succeeded, failed, total_api_calls: totalApiCalls, total_duration_ms: totalMs },
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
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
