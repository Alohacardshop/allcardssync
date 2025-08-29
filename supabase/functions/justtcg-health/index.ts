import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const justTcgApiKey = Deno.env.get('JUSTTCG_API_KEY')
  if (!justTcgApiKey) {
    return new Response(
      JSON.stringify({ 
        healthy: false, 
        error: 'API key not configured',
        checks: { api_key: false }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const startTime = Date.now()

    // Test API connectivity
    const response = await fetch('https://api.justtcg.com/v1/games', {
      headers: {
        'x-api-key': justTcgApiKey,
        'Content-Type': 'application/json'
      }
    })

    const apiDuration = Date.now() - startTime
    const healthy = response.ok

    return new Response(
      JSON.stringify({
        healthy,
        timestamp: new Date().toISOString(),
        checks: {
          api_key: true,
          api_connectivity: healthy,
          api_response_time: apiDuration,
          api_status: response.status
        },
        rate_limit: {
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset')
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        healthy: false,
        error: error.message,
        checks: {
          api_key: true,
          api_connectivity: false
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})