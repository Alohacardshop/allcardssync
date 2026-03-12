import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { SendGradedSchema, SendGradedInput } from '../_shared/validation.ts'
import { syncGradedItemToShopify, timer } from '../_shared/shopify-sync-core.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const totalTimer = timer()

  try {
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    const body = await req.json()
    const input: SendGradedInput = SendGradedSchema.parse(body)
    const { storeKey, locationGid, vendor, item } = input

    await requireStoreAccess(user.id, storeKey, locationGid)

    console.log(`[AUDIT] User ${user.id} (${user.email}) triggered shopify-send-graded for store ${storeKey}, item ${item.id}`)

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

    // Create sync run record
    const batchId = crypto.randomUUID().slice(0, 8)
    const { data: runRecord } = await supabase
      .from('shopify_sync_runs')
      .insert({
        batch_id: batchId,
        mode: 'single',
        store_key: storeKey,
        total_items: 1,
        triggered_by: user.id,
        status: 'running'
      })
      .select('id')
      .single()

    const runId = runRecord?.id

    // Execute sync
    const result = await syncGradedItemToShopify(item, {
      domain, token, storeKey, locationGid, vendor, userId: user.id, supabase
    })

    const totalMs = totalTimer()

    // Persist item result
    if (runId) {
      await supabase.from('shopify_sync_run_items').insert({
        run_id: runId,
        item_id: item.id,
        sku: item.sku,
        title: item.title,
        success: result.success,
        error: result.error,
        shopify_product_id: result.shopify_product_id,
        shopify_variant_id: result.shopify_variant_id,
        api_calls: result.api_calls,
        duration_ms: result.duration_ms
      })

      await supabase.from('shopify_sync_runs').update({
        succeeded: result.success ? 1 : 0,
        failed: result.success ? 0 : 1,
        total_api_calls: result.api_calls,
        total_duration_ms: totalMs,
        status: result.success ? 'completed' : 'failed'
      }).eq('id', runId)
    }

    if (!result.success) {
      let status = 500
      const msg = result.error || ''
      if (msg.includes('Duplicate protection')) status = 409
      else if (msg.includes('Authorization') || msg.includes('authentication')) status = 401
      else if (msg.includes('permissions') || msg.includes('Access denied')) status = 403

      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: result.shopify_product_id,
      shopify_variant_id: result.shopify_variant_id,
      admin_url: `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/products/${result.shopify_product_id}`,
      api_calls: result.api_calls,
      duration_ms: totalMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({
      event: 'shopify_sync_error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
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
