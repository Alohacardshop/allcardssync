import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getValidAccessToken, ebayApiRequest } from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Auth guard
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Service role client for DB access
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Get store config
    const { data: config, error: configError } = await supabase
      .from('ebay_store_config')
      .select('*')
      .eq('is_active', true)
      .single()

    if (configError || !config) {
      throw new Error('No active eBay store config found')
    }

    const locationKey = config.location_key
    if (!locationKey) {
      throw new Error('No location_key configured in ebay_store_config')
    }

    const environment = (config.environment || 'production') as 'sandbox' | 'production'
    const accessToken = await getValidAccessToken(supabase, config.store_key, environment)

    if (req.method === 'GET') {
      // Verify configured location_key exists on eBay
      const response = await ebayApiRequest(
        accessToken, environment, 'GET',
        `/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`
      )

      if (response.ok) {
        const body = await response.json()
        return new Response(JSON.stringify({
          success: true,
          location_key: locationKey,
          location: body,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const errorText = await response.text()
      let errorBody: any = {}
      try { errorBody = JSON.parse(errorText) } catch {}

      return new Response(JSON.stringify({
        success: false,
        location_key: locationKey,
        status: response.status,
        error: errorBody,
      }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { addressLine1, addressLine2, city, stateOrProvince, postalCode, country,
              name, locationTypes, merchantLocationStatus } = body

      if (!addressLine1 || !city || !stateOrProvince || !postalCode || !country) {
        throw new Error('Required address fields: addressLine1, city, stateOrProvince, postalCode, country')
      }

      const address: Record<string, string> = { addressLine1, city, stateOrProvince, postalCode, country }
      if (addressLine2) address.addressLine2 = addressLine2

      const payload = {
        location: { address },
        name: name || 'Aloha Card Shop',
        merchantLocationStatus: merchantLocationStatus || 'ENABLED',
        locationTypes: locationTypes || ['STORE'],
      }

      const response = await ebayApiRequest(
        accessToken, environment, 'POST',
        `/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`,
        payload
      )

      if (response.status === 204 || response.status === 200) {
        return new Response(JSON.stringify({
          success: true,
          location_key: locationKey,
          message: `Location "${locationKey}" registered on eBay`,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const errorText = await response.text()
      let errorBody: any = {}
      try { errorBody = JSON.parse(errorText) } catch {}

      return new Response(JSON.stringify({
        success: false,
        location_key: locationKey,
        status: response.status,
        error: errorBody,
      }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ebay-manage-location error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
