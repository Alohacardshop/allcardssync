import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildAuthorizationUrl, type EbayConfig } from '../_shared/ebayAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { store_key } = await req.json()
    
    if (!store_key) {
      return new Response(
        JSON.stringify({ error: 'store_key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get eBay credentials from environment
    const clientId = Deno.env.get('EBAY_CLIENT_ID')
    const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')
    const ruName = Deno.env.get('EBAY_RUNAME')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!clientId || !clientSecret || !ruName) {
      return new Response(
        JSON.stringify({ error: 'eBay credentials not configured. Please add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use the RuName as redirect_uri for eBay OAuth (this is what eBay expects)
    const redirectUri = ruName

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get or create store config to determine environment
    const { data: storeConfig } = await supabase
      .from('ebay_store_config')
      .select('environment')
      .eq('store_key', store_key)
      .maybeSingle()

    const environment = (storeConfig?.environment || 'sandbox') as 'sandbox' | 'production'

    // Create state token with store_key for callback
    const state = btoa(JSON.stringify({ 
      store_key, 
      timestamp: Date.now(),
      nonce: crypto.randomUUID()
    }))

    const config: EbayConfig = {
      clientId,
      clientSecret,
      redirectUri,
      environment,
    }

    const authUrl = buildAuthorizationUrl(config, state)

    return new Response(
      JSON.stringify({ 
        auth_url: authUrl,
        environment,
        message: 'Redirect user to auth_url to begin eBay OAuth flow'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('eBay auth init error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
