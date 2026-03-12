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
    // 1. Authenticate user and validate JWT
    const user = await requireAuth(req)
    
    // 2. Verify user has staff/admin role
    await requireRole(user.id, ['admin', 'staff'])

    // 3. Validate input with Zod schema
    const body = await req.json()
    const input: SendGradedInput = SendGradedSchema.parse(body)
    const { storeKey, locationGid, vendor, item } = input

    // 4. Verify user has access to this store/location
    await requireStoreAccess(user.id, storeKey, locationGid)

    // 5. Log audit trail
    console.log(`[AUDIT] User ${user.id} (${user.email}) triggered shopify-send-graded for store ${storeKey}, item ${item.id}`)

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Shopify credentials
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

    // Execute sync using shared helper
    const result = await syncGradedItemToShopify(item, {
      domain, token, storeKey, locationGid, vendor, userId: user.id, supabase
    })

    if (!result.success) {
      // Determine status code from error message
      let status = 500
      const msg = result.error || ''
      if (msg.includes('Duplicate protection')) status = 409
      else if (msg.includes('Authorization') || msg.includes('authentication')) status = 401
      else if (msg.includes('permissions') || msg.includes('Access denied')) status = 403

      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch product handle for URL construction
    const totalMs = totalTimer()

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
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
