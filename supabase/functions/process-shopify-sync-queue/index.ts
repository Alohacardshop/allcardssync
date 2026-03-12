import { corsHeaders } from '../_shared/cors.ts'
import { syncGradedItemToShopify, timer } from '../_shared/shopify-sync-core.ts'

const DEFAULT_CONCURRENCY = 5
const MAX_CONCURRENCY = 10
const STALE_RUNNING_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const LEASE_DURATION_SECONDS = 300 // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60_000 // refresh every 60s

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const totalTimer = timer()
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`

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

    // --- Phase 1: Reclaim stale resources ---

    // Reclaim stale jobs whose lease expired (atomic, moves running items back to queued)
    const { data: reclaimedJobs } = await supabase.rpc('reclaim_stale_shopify_sync_jobs')
    if (reclaimedJobs?.length) {
      console.log(JSON.stringify({
        event: 'shopify_sync_stale_jobs_reclaimed',
        worker_id: workerId,
        reclaimed: reclaimedJobs.map((r: any) => ({ job_id: r.job_id, new_status: r.new_status }))
      }))
    }

    // Also reclaim orphaned stale running items (belt-and-suspenders)
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS).toISOString()
    await supabase
      .from('shopify_sync_job_items')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('status', 'running')
      .lt('updated_at', staleThreshold)

    // --- Phase 2: Claim a job ---

    const { data: claimedJobs, error: claimErr } = await supabase
      .rpc('claim_shopify_sync_job', {
        target_job_id: targetJobId || undefined,
        lease_duration_seconds: LEASE_DURATION_SECONDS,
        worker_id: workerId
      })

    if (claimErr) throw new Error(`Failed to claim job: ${claimErr.message}`)
    if (!claimedJobs?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No jobs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const job = claimedJobs[0]

    console.log(JSON.stringify({
      event: 'shopify_sync_job_started',
      job_id: job.id,
      batch_id: job.batch_id,
      store_key: job.store_key,
      total_items: job.total_items,
      worker_id: workerId,
      lease_expires_at: job.lease_expires_at
    }))

    // --- Phase 3: Start heartbeat ---

    let heartbeatHandle: number | undefined
    function startHeartbeat() {
      heartbeatHandle = setInterval(async () => {
        try {
          const { data: ok } = await supabase.rpc('refresh_shopify_sync_job_lease', {
            p_job_id: job.id,
            lease_duration_seconds: LEASE_DURATION_SECONDS
          })
          if (!ok) {
            console.log(JSON.stringify({
              event: 'shopify_sync_heartbeat_failed',
              job_id: job.id,
              worker_id: workerId,
              reason: 'job_no_longer_running'
            }))
          }
        } catch (err) {
          console.log(JSON.stringify({
            event: 'shopify_sync_heartbeat_error',
            job_id: job.id,
            worker_id: workerId,
            error: err.message
          }))
        }
      }, HEARTBEAT_INTERVAL_MS)
    }

    function stopHeartbeat() {
      if (heartbeatHandle !== undefined) {
        clearInterval(heartbeatHandle)
        heartbeatHandle = undefined
      }
    }

    startHeartbeat()

    try {
      // --- Phase 4: Fetch credentials ---

      const storeUpper = job.store_key.toUpperCase()
      const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
        supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
        supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
      ])

      const domain = domainSetting?.key_value
      const token = tokenSetting?.key_value
      if (!domain || !token) throw new Error(`Missing Shopify credentials for ${job.store_key}`)

      // Helper: check if the job has been cancelled
      async function isJobCancelled(): Promise<boolean> {
        const { data } = await supabase
          .from('shopify_sync_job_queue')
          .select('status')
          .eq('id', job.id)
          .single()
        return data?.status === 'cancelled'
      }

      // Check cancellation before claiming items
      if (await isJobCancelled()) {
        const totalMs = totalTimer()
        stopHeartbeat()
        await finalizeJob(supabase, job.id, totalMs, true)
        console.log(JSON.stringify({ event: 'shopify_sync_job_cancelled', job_id: job.id, worker_id: workerId }))
        return new Response(JSON.stringify({ success: true, job_id: job.id, message: 'Job was cancelled before processing' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // --- Phase 5: Claim items ---

      const concurrency = Math.min(DEFAULT_CONCURRENCY, MAX_CONCURRENCY)
      const { data: claimedItems, error: itemsErr } = await supabase
        .rpc('claim_shopify_sync_job_items', { p_job_id: job.id, p_limit: 500 })

      if (itemsErr) throw new Error(`Failed to claim job items: ${itemsErr.message}`)
      if (!claimedItems?.length) {
        stopHeartbeat()
        await finalizeJob(supabase, job.id)
        return new Response(JSON.stringify({ success: true, message: 'Job already complete' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Fetch intake item data for all claimed items
      const itemIds = claimedItems.map((qi: any) => qi.item_id)
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

      // --- Phase 6: Process items ---

      let processedCount = job.processed_items || 0
      let succeededCount = job.succeeded || 0
      let failedCount = job.failed || 0
      let totalApiCalls = job.total_api_calls || 0
      let cancelledDuringProcessing = false

      let nextIndex = 0

      async function worker() {
        while (nextIndex < claimedItems.length) {
          if (cancelledDuringProcessing) break

          if (await isJobCancelled()) {
            cancelledDuringProcessing = true
            console.log(JSON.stringify({ event: 'shopify_sync_job_cancelled_mid_processing', job_id: job.id, worker_id: workerId }))
            break
          }

          const idx = nextIndex++
          if (idx >= claimedItems.length) break
          const jobItem = claimedItems[idx]
          const dbItem = itemMap.get(jobItem.item_id)

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

            const failureCode = result.success ? null : classifyError(result.error)
            const itemStatus = result.success ? 'succeeded' :
              (failureCode === 'duplicate' || failureCode === 'blocked_business_rule' ? 'blocked' : 'failed')

            await supabase.from('shopify_sync_job_items').update({
              status: itemStatus,
              failure_code: failureCode,
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
              failure_code: failureCode,
              error: result.error
            }))
          } catch (err) {
            const failureCode = classifyError(err.message)
            failedCount++
            processedCount++

            await supabase.from('shopify_sync_job_items').update({
              status: 'failed',
              failure_code: failureCode,
              last_error: err.message,
              updated_at: new Date().toISOString()
            }).eq('id', jobItem.id)

            console.log(JSON.stringify({
              event: 'shopify_sync_job_item_failed',
              job_id: job.id,
              item_id: jobItem.item_id,
              failure_code: failureCode,
              error: err.message
            }))
          }

          // Update job progress
          await supabase.from('shopify_sync_job_queue').update({
            processed_items: processedCount,
            succeeded: succeededCount,
            failed: failedCount,
            total_api_calls: totalApiCalls
          }).eq('id', job.id)
        }
      }

      const workers = Array.from(
        { length: Math.min(concurrency, claimedItems.length) },
        () => worker()
      )
      await Promise.all(workers)

      // Release unclaimed running items back to queued if cancelled
      if (cancelledDuringProcessing) {
        const processedItemIds = new Set(
          claimedItems.slice(0, nextIndex).map((i: any) => i.id)
        )
        const unprocessedItems = claimedItems.filter((i: any) => !processedItemIds.has(i.id))
        if (unprocessedItems.length > 0) {
          const unprocessedIds = unprocessedItems.map((i: any) => i.id)
          await supabase.from('shopify_sync_job_items')
            .update({ status: 'queued', updated_at: new Date().toISOString() })
            .in('id', unprocessedIds)
            .eq('status', 'running')
        }
      }

      // --- Phase 7: Finalize ---

      stopHeartbeat()
      const totalMs = totalTimer()
      await finalizeJob(supabase, job.id, totalMs, cancelledDuringProcessing)

      const finalEvent = cancelledDuringProcessing ? 'shopify_sync_job_cancelled' : 'shopify_sync_job_completed'
      console.log(JSON.stringify({
        event: finalEvent,
        job_id: job.id,
        batch_id: job.batch_id,
        processed: processedCount,
        succeeded: succeededCount,
        failed: failedCount,
        total_api_calls: totalApiCalls,
        total_duration_ms: totalMs,
        worker_id: workerId
      }))

      return new Response(JSON.stringify({
        success: true,
        job_id: job.id,
        batch_id: job.batch_id,
        processed: processedCount,
        succeeded: succeededCount,
        failed: failedCount,
        total_api_calls: totalApiCalls,
        total_duration_ms: totalMs,
        cancelled: cancelledDuringProcessing
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } finally {
      // Ensure heartbeat is always cleaned up
      stopHeartbeat()
    }

  } catch (error) {
    console.error(JSON.stringify({
      event: 'shopify_sync_queue_processor_error',
      error: error.message,
      duration_ms: totalTimer(),
      worker_id: workerId
    }))

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// ── Job Status Types ──

type JobStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled'

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(['completed', 'failed', 'partial', 'cancelled'])

interface ItemCounts {
  succeeded: number
  failed: number
  remaining: number
  totalApiCalls: number
  processed: number
}

function countItems(items: any[]): ItemCounts {
  const succeeded = items.filter((i: any) => i.status === 'succeeded').length
  const failed = items.filter((i: any) => i.status === 'failed' || i.status === 'blocked').length
  const remaining = items.filter((i: any) => i.status === 'queued').length
  const totalApiCalls = items.reduce((s: number, i: any) => s + (i.api_calls || 0), 0)
  return { succeeded, failed, remaining, totalApiCalls, processed: succeeded + failed }
}

function resolveJobStatus(counts: ItemCounts, isCancelled: boolean): JobStatus {
  if (isCancelled) return 'cancelled'
  const { succeeded, failed, remaining, processed } = counts
  if (remaining > 0 && processed > 0) return 'partial'
  if (remaining > 0 && processed === 0) return 'queued'
  if (failed > 0 && succeeded === 0) return 'failed'
  if (failed > 0) return 'partial'
  return 'completed'
}

function mapJobStatusToRunStatus(status: JobStatus): string {
  if (status === 'partial') return 'partial_failure'
  return status // completed, failed, cancelled pass through
}

// ── Finalization ──

async function finalizeJob(supabase: any, jobId: string, durationMs?: number, wasCancelled?: boolean) {
  // Determine cancellation: caller flag OR current DB state
  let isCancelled = wasCancelled || false
  const { data: currentJob } = await supabase
    .from('shopify_sync_job_queue')
    .select('status, batch_id, store_key, triggered_by, total_items')
    .eq('id', jobId)
    .single()

  if (!isCancelled && currentJob?.status === 'cancelled') {
    isCancelled = true
  }

  // Never overwrite a cancellation with another state
  if (currentJob?.status === 'cancelled') {
    isCancelled = true
  }

  // Count item results
  const { data: items } = await supabase
    .from('shopify_sync_job_items')
    .select('status, api_calls, duration_ms, item_id, last_error, shopify_product_id, shopify_variant_id')
    .eq('job_id', jobId)

  const allItems = items || []
  const counts = countItems(allItems)
  const status = resolveJobStatus(counts, isCancelled)
  const isTerminal = TERMINAL_STATUSES.has(status)

  // Update job record
  await supabase.from('shopify_sync_job_queue').update({
    status,
    processed_items: counts.processed,
    succeeded: counts.succeeded,
    failed: counts.failed,
    total_api_calls: counts.totalApiCalls,
    total_duration_ms: durationMs || 0,
    completed_at: isTerminal ? new Date().toISOString() : null,
    heartbeat_at: null,
    lease_expires_at: null,
    claimed_by: null
  }).eq('id', jobId)

  // Sync results into shopify_sync_runs for dashboard history
  if (!currentJob || !isTerminal) return

  const { data: existingRun } = await supabase
    .from('shopify_sync_runs')
    .select('id')
    .eq('batch_id', currentJob.batch_id)
    .single()

  const runData = {
    batch_id: currentJob.batch_id,
    mode: 'bulk',
    store_key: currentJob.store_key,
    total_items: currentJob.total_items,
    succeeded: counts.succeeded,
    failed: counts.failed,
    total_api_calls: counts.totalApiCalls,
    total_duration_ms: durationMs || 0,
    triggered_by: currentJob.triggered_by,
    status: mapJobStatusToRunStatus(status)
  }

  let runId: string
  if (existingRun) {
    await supabase.from('shopify_sync_runs').update(runData).eq('id', existingRun.id)
    runId = existingRun.id
  } else {
    const { data: newRun } = await supabase.from('shopify_sync_runs').insert(runData).select('id').single()
    runId = newRun?.id
  }

  // Upsert processed item results
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

type FailureCode =
  | 'duplicate'
  | 'validation_error'
  | 'rate_limited'
  | 'shopify_api_error'
  | 'network_error'
  | 'missing_inventory_data'
  | 'blocked_business_rule'
  | 'unknown_error'

function classifyError(errorMsg?: string | null): FailureCode {
  if (!errorMsg) return 'unknown_error'
  const msg = errorMsg.toLowerCase()

  // Duplicate / already exists
  if (msg.includes('duplicate protection') || msg.includes('already exists') || msg.includes('duplicate sku'))
    return 'duplicate'

  // Rate limiting
  if (msg.includes('throttl') || msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests'))
    return 'rate_limited'

  // Missing data needed for sync
  if (msg.includes('missing') && (msg.includes('sku') || msg.includes('price') || msg.includes('inventory') || msg.includes('data')))
    return 'missing_inventory_data'

  // Validation errors
  if (msg.includes('invalid') || msg.includes('validation') || msg.includes('required field') || msg.includes('must be'))
    return 'validation_error'

  // Business rule blocks
  if (msg.includes('blocked') || msg.includes('not eligible') || msg.includes('business rule') || msg.includes('cannot sync'))
    return 'blocked_business_rule'

  // Network errors
  if (msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('network') || msg.includes('dns') || msg.includes('enotfound'))
    return 'network_error'

  // Shopify API errors (status codes or explicit API messages)
  if (msg.includes('shopify') || msg.includes('graphql') || msg.includes('api error') || /\b[45]\d{2}\b/.test(msg))
    return 'shopify_api_error'

  return 'unknown_error'
}
