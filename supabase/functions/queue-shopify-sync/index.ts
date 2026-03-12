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
    const { item_ids, storeKey, locationGid, vendor } = body

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
        total_items: item_ids.length,
        triggered_by: user.id
      })
      .select('id')
      .single()

    if (jobError || !job) {
      throw new Error(`Failed to create job: ${jobError?.message}`)
    }

    // Create job item records
    const jobItems = item_ids.map((itemId: string) => ({
      job_id: job.id,
      item_id: itemId,
      status: 'queued'
    }))

    const { error: itemsError } = await supabase
      .from('shopify_sync_job_items')
      .insert(jobItems)

    if (itemsError) {
      throw new Error(`Failed to create job items: ${itemsError.message}`)
    }

    console.log(JSON.stringify({
      event: 'shopify_sync_job_queued',
      job_id: job.id,
      batch_id: batchId,
      total_items: item_ids.length,
      store_key: storeKey,
      triggered_by: user.id
    }))

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      batch_id: batchId,
      total_items: item_ids.length,
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
