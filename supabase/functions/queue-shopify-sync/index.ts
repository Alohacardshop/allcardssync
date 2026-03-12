import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    const body = await req.json()
    const { item_ids, storeKey, locationGid, vendor, idempotency_key } = body

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'item_ids must be a non-empty array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!storeKey || !locationGid) {
      return new Response(JSON.stringify({ success: false, error: 'storeKey and locationGid are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await requireStoreAccess(user.id, storeKey, locationGid)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Deduplicate item_ids
    const uniqueItemIds = [...new Set(item_ids as string[])]

    // Generate or use provided idempotency key
    const effectiveKey = idempotency_key || null

    // If idempotency_key provided, check for an existing active job
    if (effectiveKey) {
      const { data: existingJob } = await supabase
        .from('shopify_sync_job_queue')
        .select('id, batch_id, status, total_items')
        .eq('idempotency_key', effectiveKey)
        .not('status', 'in', '("completed","failed","cancelled")')
        .limit(1)
        .single()

      if (existingJob) {
        console.log(JSON.stringify({
          event: 'shopify_sync_job_deduplicated',
          existing_job_id: existingJob.id,
          idempotency_key: effectiveKey
        }))

        return new Response(JSON.stringify({
          success: true,
          job_id: existingJob.id,
          batch_id: existingJob.batch_id,
          total_items: existingJob.total_items,
          status: existingJob.status,
          deduplicated: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const batchId = crypto.randomUUID().slice(0, 8)

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('shopify_sync_job_queue')
      .insert({
        batch_id: batchId,
        store_key: storeKey,
        location_gid: locationGid,
        vendor: vendor || null,
        status: 'queued',
        total_items: uniqueItemIds.length,
        triggered_by: user.id,
        idempotency_key: effectiveKey
      })
      .select('id')
      .single()

    if (jobError) {
      // Handle race condition: partial unique index violation means another request won
      if (jobError.code === '23505' && effectiveKey) {
        const { data: racedJob } = await supabase
          .from('shopify_sync_job_queue')
          .select('id, batch_id, status, total_items')
          .eq('idempotency_key', effectiveKey)
          .not('status', 'in', '("completed","failed","cancelled")')
          .limit(1)
          .single()

        if (racedJob) {
          return new Response(JSON.stringify({
            success: true,
            job_id: racedJob.id,
            batch_id: racedJob.batch_id,
            total_items: racedJob.total_items,
            status: racedJob.status,
            deduplicated: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      throw new Error(`Failed to create job: ${jobError.message}`)
    }

    if (!job) {
      throw new Error('Failed to create job: no data returned')
    }

    // Create job item records using ON CONFLICT to handle any duplicates safely
    const jobItems = uniqueItemIds.map((itemId: string) => ({
      job_id: job.id,
      item_id: itemId,
      status: 'queued'
    }))

    const { error: itemsError } = await supabase
      .from('shopify_sync_job_items')
      .upsert(jobItems, { onConflict: 'job_id,item_id', ignoreDuplicates: true })

    if (itemsError) {
      throw new Error(`Failed to create job items: ${itemsError.message}`)
    }

    console.log(JSON.stringify({
      event: 'shopify_sync_job_queued',
      job_id: job.id,
      batch_id: batchId,
      total_items: uniqueItemIds.length,
      store_key: storeKey,
      triggered_by: user.id,
      idempotency_key: effectiveKey,
      deduped_count: item_ids.length - uniqueItemIds.length
    }))

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      batch_id: batchId,
      total_items: uniqueItemIds.length,
      status: 'queued'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({ event: 'shopify_sync_queue_error', error: error.message }))

    let status = 500
    if (error.message?.includes('Authorization') || error.message?.includes('authentication')) status = 401
    else if (error.message?.includes('permissions') || error.message?.includes('Access denied')) status = 403

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
