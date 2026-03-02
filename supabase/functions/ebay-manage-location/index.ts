import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getValidAccessToken, ebayApiRequest } from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get store config
    const { data: config, error: configError } = await supabase
      .from('ebay_store_config')
      .select('*')
      .eq('is_active', true)
      .single()

    if (configError || !config) {
      throw new Error('No active eBay store config found')
    }

    const environment = (config.environment || 'production') as 'sandbox' | 'production'
    const accessToken = await getValidAccessToken(supabase, config.store_key, environment)

    if (req.method === 'GET') {
      // List all merchant locations
      const response = await ebayApiRequest(
        accessToken, environment, 'GET',
        '/sell/inventory/v1/location?limit=100'
      )

      const body = await response.json()
      return new Response(JSON.stringify({
        success: true,
        status: response.status,
        current_config_location_key: config.location_key,
        locations: body.locations || [],
        total: body.total || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      // Create or update a location
      const { merchantLocationKey, location, name, locationTypes } = await req.json()

      if (!merchantLocationKey) {
        throw new Error('merchantLocationKey is required')
      }

      const payload: Record<string, unknown> = {
        location,
        name: name || merchantLocationKey,
        merchantLocationStatus: 'ENABLED',
        locationTypes: locationTypes || ['STORE'],
      }

      const response = await ebayApiRequest(
        accessToken, environment, 'POST',
        `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
        payload
      )

      const responseText = await response.text()
      return new Response(JSON.stringify({
        success: response.status === 204 || response.status === 200,
        status: response.status,
        response: responseText ? JSON.parse(responseText) : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ebay-manage-location error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
