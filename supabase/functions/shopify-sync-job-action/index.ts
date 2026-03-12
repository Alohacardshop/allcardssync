import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    const body = await req.json()
    const { action, job_id } = body

    if (!job_id) {
      return new Response(JSON.stringify({ success: false, error: 'job_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!['cancel', 'resume', 'retry_failed'].includes(action)) {
      return new Response(JSON.stringify({ success: false, error: 'action must be cancel, resume, or retry_failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch current job
    const { data: job, error: jobErr } = await supabase
      .from('shopify_sync_job_queue')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobErr || !job) {
      return new Response(JSON.stringify({ success: false, error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let result: any

    switch (action) {
      case 'cancel':
        result = await handleCancel(supabase, job)
        break
      case 'resume':
        result = await handleResume(supabase, job, supabaseUrl, supabaseServiceKey)
        break
      case 'retry_failed':
        result = await handleRetryFailed(supabase, job, supabaseUrl, supabaseServiceKey)
        break
    }

    console.log(JSON.stringify({
      event: `shopify_sync_job_action_${action}`,
      job_id: job.id,
      user_id: user.id,
      result_status: result.status
    }))

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({ event: 'shopify_sync_job_action_error', error: error.message }))

    let status = 500
    if (error.message?.includes('Authorization') || error.message?.includes('authentication')) status = 401
    else if (error.message?.includes('permissions') || error.message?.includes('Access denied')) status = 403

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function handleCancel(supabase: any, job: any) {
  if (!['queued', 'running'].includes(job.status)) {
    throw new Error(`Cannot cancel job in '${job.status}' state. Only queued or running jobs can be cancelled.`)
  }

  const { error } = await supabase
    .from('shopify_sync_job_queue')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      heartbeat_at: null,
      lease_expires_at: null,
      claimed_by: null
    })
    .eq('id', job.id)
    .in('status', ['queued', 'running'])

  if (error) throw new Error(`Failed to cancel job: ${error.message}`)

  // Fetch updated job
  const { data: updated } = await supabase
    .from('shopify_sync_job_queue')
    .select('*')
    .eq('id', job.id)
    .single()

  return { status: 'cancelled', job: updated }
}

async function handleResume(supabase: any, job: any, supabaseUrl: string, serviceKey: string) {
  if (!['partial', 'failed'].includes(job.status)) {
    throw new Error(`Cannot resume job in '${job.status}' state. Only partial or failed jobs can be resumed.`)
  }

  // Check there are remaining queued items
  const { count } = await supabase
    .from('shopify_sync_job_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('status', 'queued')

  if (!count || count === 0) {
    throw new Error('No queued items remaining to resume')
  }

  // Reset job to queued
  const { error } = await supabase
    .from('shopify_sync_job_queue')
    .update({ status: 'queued', completed_at: null })
    .eq('id', job.id)

  if (error) throw new Error(`Failed to reset job for resume: ${error.message}`)

  // Trigger the worker
  const workerUrl = `${supabaseUrl}/functions/v1/process-shopify-sync-queue`
  const workerResp = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ job_id: job.id })
  })

  if (!workerResp.ok) {
    const errText = await workerResp.text()
    console.error(JSON.stringify({ event: 'shopify_sync_resume_worker_error', job_id: job.id, error: errText }))
    // Job is still queued, worker can pick it up later — don't fail the action
  }

  const { data: updated } = await supabase
    .from('shopify_sync_job_queue')
    .select('*')
    .eq('id', job.id)
    .single()

  return { status: updated?.status || 'queued', job: updated }
}

async function handleRetryFailed(supabase: any, job: any, supabaseUrl: string, serviceKey: string) {
  // Count failed/blocked items
  const { data: failedItems, error: countErr } = await supabase
    .from('shopify_sync_job_items')
    .select('id')
    .eq('job_id', job.id)
    .in('status', ['failed', 'blocked'])

  if (countErr) throw new Error(`Failed to fetch failed items: ${countErr.message}`)
  if (!failedItems?.length) {
    throw new Error('No failed or blocked items to retry')
  }

  // Reset failed/blocked items to queued atomically
  const failedIds = failedItems.map((i: any) => i.id)
  const { error: resetErr } = await supabase
    .from('shopify_sync_job_items')
    .update({ status: 'queued', last_error: null, failure_code: null, updated_at: new Date().toISOString() })
    .in('id', failedIds)

  if (resetErr) throw new Error(`Failed to reset items: ${resetErr.message}`)

  // Reset job to queued
  const { error: jobErr } = await supabase
    .from('shopify_sync_job_queue')
    .update({ status: 'queued', completed_at: null })
    .eq('id', job.id)

  if (jobErr) throw new Error(`Failed to reset job: ${jobErr.message}`)

  // Trigger worker
  const workerUrl = `${supabaseUrl}/functions/v1/process-shopify-sync-queue`
  const workerResp = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ job_id: job.id })
  })

  if (!workerResp.ok) {
    const errText = await workerResp.text()
    console.error(JSON.stringify({ event: 'shopify_sync_retry_worker_error', job_id: job.id, error: errText }))
  }

  const { data: updated } = await supabase
    .from('shopify_sync_job_queue')
    .select('*')
    .eq('id', job.id)
    .single()

  return { status: updated?.status || 'queued', job: updated, retried_items: failedIds.length }
}
