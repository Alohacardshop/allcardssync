import { corsHeaders } from '../_shared/cors.ts'
import { syncGradedItemToShopify, timer } from '../_shared/shopify-sync-core.ts'

const DEFAULT_CONCURRENCY = 5
const MAX_CONCURRENCY = 10
const STALE_RUNNING_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

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

    // Parse optional job_id from body (for resume)
    let targetJobId: string | null = null
    try {
      const body = await req.json()
      targetJobId = body?.job_id || null
    } catch { /* no body is fine */ }

    // Reclaim stale running items (worker died mid-job)
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS).toISOString()
    await supabase
      .from('shopify_sync_job_items')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('status', 'running')
      .lt('updated_at', staleThreshold)

    // Claim next job: specific or oldest queued/partial
    let jobQuery = supabase
      .from('shopify_sync_job_queue')
      .select('*')

    if (targetJobId) {
      jobQuery = jobQuery.eq('id', targetJobId).in('status', ['queued', 'partial', 'running'])
    } else {
      jobQuery = jobQuery.in('status', ['queued', 'partial']).order('created_at', { ascending: true }).limit(1)
    }

    const { data: jobs, error: jobErr } = await jobQuery
    if (jobErr) throw new Error(`Failed to fetch job: ${jobErr.message}`)
    if (!jobs?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No jobs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const job = jobs[0]

    // Mark job as running
    await supabase.from('shopify_sync_job_queue')
      .update({ status: 'running', started_at: job.started_at || new Date().toISOString() })
      .eq('id', job.id)

    console.log(JSON.stringify({
      event: 'shopify_sync_job_started',
      job_id: job.id,
      batch_id: job.batch_id,
      store_key: job.store_key,
      total_items: job.total_items
    }))

    // Fetch store credentials
    const storeUpper = job.store_key.toUpperCase()
    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])

    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value
    if (!domain || !token) throw new Error(`Missing Shopify credentials for ${job.store_key}`)

    // Get queued items for this job
    const { data: queuedItems, error: itemsErr } = await supabase
      .from('shopify_sync_job_items')
      .select('*')
      .eq('job_id', job.id)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })

    if (itemsErr) throw new Error(`Failed to fetch job items: ${itemsErr.message}`)
    if (!queuedItems?.length) {
      // All items already processed, finalize
      await finalizeJob(supabase, job.id)
      return new Response(JSON.stringify({ success: true, message: 'Job already complete' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch intake item data for all queued items
    const itemIds = queuedItems.map((qi: any) => qi.item_id)
    const { data: intakeItems } = await supabase
      .from('intake_items')
      .select('id, sku, price, cost, psa_cert, grade, year, brand_title, subject, card_number, variant, category, image_url')
      .in('id', itemIds)

    const itemMap = new Map((intakeItems || []).map((i: any) => [i.id, i]))

    const ctx = {
      domain, token,
      storeKey: job.store_key,
      locationGid: job.location_gid,
      vendor: job.vendor,
      userId: job.triggered_by || 'system',
      supabase
    }

    // Process with controlled concurrency
    const concurrency = Math.min(DEFAULT_CONCURRENCY, MAX_CONCURRENCY)
    let processedCount = job.processed_items || 0
    let succeededCount = job.succeeded || 0
    let failedCount = job.failed || 0
    let totalApiCalls = job.total_api_calls || 0

    let nextIndex = 0

    async function worker() {
      while (nextIndex < queuedItems.length) {
        const idx = nextIndex++
        const jobItem = queuedItems[idx]
        const dbItem = itemMap.get(jobItem.item_id)

        // Mark item as running
        await supabase.from('shopify_sync_job_items')
          .update({ status: 'running', attempt_count: jobItem.attempt_count + 1, updated_at: new Date().toISOString() })
          .eq('id', jobItem.id)

        console.log(JSON.stringify({
          event: 'shopify_sync_job_item_started',
          job_id: job.id,
          item_id: jobItem.item_id
        }))

        const syncItem = {
          id: jobItem.item_id,
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

        try {
          const result = await syncGradedItemToShopify(syncItem, ctx)

          const itemStatus = result.success ? 'succeeded' :
            (result.error?.includes('Duplicate protection') ? 'blocked' : 'failed')

          await supabase.from('shopify_sync_job_items').update({
            status: itemStatus,
            last_error: result.error || null,
            shopify_product_id: result.shopify_product_id || null,
            shopify_variant_id: result.shopify_variant_id || null,
            api_calls: result.api_calls,
            duration_ms: result.duration_ms,
            updated_at: new Date().toISOString()
          }).eq('id', jobItem.id)

          if (result.success) succeededCount++
          else failedCount++
          totalApiCalls += result.api_calls
          processedCount++

          console.log(JSON.stringify({
            event: result.success ? 'shopify_sync_job_item_complete' : 'shopify_sync_job_item_failed',
            job_id: job.id,
            item_id: jobItem.item_id,
            success: result.success,
            error: result.error
          }))
        } catch (err) {
          failedCount++
          processedCount++

          await supabase.from('shopify_sync_job_items').update({
            status: 'failed',
            last_error: err.message,
            updated_at: new Date().toISOString()
          }).eq('id', jobItem.id)

          console.log(JSON.stringify({
            event: 'shopify_sync_job_item_failed',
            job_id: job.id,
            item_id: jobItem.item_id,
            error: err.message
          }))
        }

        // Update job progress periodically
        await supabase.from('shopify_sync_job_queue').update({
          processed_items: processedCount,
          succeeded: succeededCount,
          failed: failedCount,
          total_api_calls: totalApiCalls
        }).eq('id', job.id)
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, queuedItems.length) },
      () => worker()
    )
    await Promise.all(workers)

    // Finalize job
    const totalMs = totalTimer()
    await finalizeJob(supabase, job.id, totalMs)

    console.log(JSON.stringify({
      event: 'shopify_sync_job_completed',
      job_id: job.id,
      batch_id: job.batch_id,
      processed: processedCount,
      succeeded: succeededCount,
      failed: failedCount,
      total_api_calls: totalApiCalls,
      total_duration_ms: totalMs
    }))

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      batch_id: job.batch_id,
      processed: processedCount,
      succeeded: succeededCount,
      failed: failedCount,
      total_api_calls: totalApiCalls,
      total_duration_ms: totalMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({
      event: 'shopify_sync_queue_processor_error',
      error: error.message,
      duration_ms: totalTimer()
    }))

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function finalizeJob(supabase: any, jobId: string, durationMs?: number) {
  // Get final counts from items
  const { data: items } = await supabase
    .from('shopify_sync_job_items')
    .select('status, api_calls, duration_ms, item_id, last_error, shopify_product_id, shopify_variant_id')
    .eq('job_id', jobId)

  const allItems = items || []
  const succeeded = allItems.filter((i: any) => i.status === 'succeeded').length
  const failed = allItems.filter((i: any) => i.status === 'failed' || i.status === 'blocked').length
  const remaining = allItems.filter((i: any) => i.status === 'queued').length
  const totalApiCalls = allItems.reduce((s: number, i: any) => s + (i.api_calls || 0), 0)
  const processed = succeeded + failed

  let status = 'completed'
  if (remaining > 0 && processed > 0) status = 'partial'
  else if (remaining > 0 && processed === 0) status = 'queued'
  else if (failed > 0 && succeeded === 0) status = 'failed'
  else if (failed > 0) status = 'partial'

  const { data: job } = await supabase
    .from('shopify_sync_job_queue')
    .select('batch_id, store_key, triggered_by, total_items')
    .eq('id', jobId)
    .single()

  await supabase.from('shopify_sync_job_queue').update({
    status,
    processed_items: processed,
    succeeded,
    failed,
    total_api_calls: totalApiCalls,
    total_duration_ms: durationMs || 0,
    completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
  }).eq('id', jobId)

  // Roll results into shopify_sync_runs for dashboard history
  if (job && (status === 'completed' || status === 'failed' || status === 'partial')) {
    const { data: existingRun } = await supabase
      .from('shopify_sync_runs')
      .select('id')
      .eq('batch_id', job.batch_id)
      .single()

    const runData = {
      batch_id: job.batch_id,
      mode: 'bulk',
      store_key: job.store_key,
      total_items: job.total_items,
      succeeded,
      failed,
      total_api_calls: totalApiCalls,
      total_duration_ms: durationMs || 0,
      triggered_by: job.triggered_by,
      status: status === 'partial' ? 'partial_failure' : status
    }

    let runId: string
    if (existingRun) {
      await supabase.from('shopify_sync_runs').update(runData).eq('id', existingRun.id)
      runId = existingRun.id
    } else {
      const { data: newRun } = await supabase.from('shopify_sync_runs').insert(runData).select('id').single()
      runId = newRun?.id
    }

    // Upsert run items
    if (runId) {
      for (const item of allItems) {
        if (item.status === 'succeeded' || item.status === 'failed' || item.status === 'blocked') {
          await supabase.from('shopify_sync_run_items').upsert({
            run_id: runId,
            item_id: item.item_id,
            success: item.status === 'succeeded',
            error: item.last_error,
            shopify_product_id: item.shopify_product_id,
            shopify_variant_id: item.shopify_variant_id,
            api_calls: item.api_calls || 0,
            duration_ms: item.duration_ms || 0
          }, { onConflict: 'run_id,item_id', ignoreDuplicates: false })
        }
      }
    }
  }
}
