import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`Disconnecting eBay account for store: ${store_key}`)

    // Delete the OAuth tokens from system_settings
    const { error: tokenDeleteError } = await supabase
      .from('system_settings')
      .delete()
      .eq('key_name', `EBAY_TOKENS_${store_key}`)

    if (tokenDeleteError) {
      console.error('Failed to delete tokens:', tokenDeleteError)
      throw new Error(`Failed to delete tokens: ${tokenDeleteError.message}`)
    }

    // Update store config to clear connection status
    const { error: configUpdateError } = await supabase
      .from('ebay_store_config')
      .update({
        oauth_connected_at: null,
        ebay_user_id: null,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('store_key', store_key)

    if (configUpdateError) {
      console.error('Failed to update store config:', configUpdateError)
      throw new Error(`Failed to update config: ${configUpdateError.message}`)
    }

    console.log(`Successfully disconnected eBay account for store: ${store_key}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `eBay account disconnected for store: ${store_key}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('eBay disconnect error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
