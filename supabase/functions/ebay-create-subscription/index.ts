import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function refreshToken(supabase: any, storeKey: string): Promise<string> {
  const { data: tokenData } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `EBAY_TOKENS_${storeKey}`)
    .single()

  const tokens = typeof tokenData.key_value === 'string' 
    ? JSON.parse(tokenData.key_value) 
    : tokenData.key_value

  const clientId = Deno.env.get('EBAY_CLIENT_ID')!
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')!
  const credentials = btoa(`${clientId}:${clientSecret}`)

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
  ].join(' ')

  console.log('[eBay] Refreshing access token...')
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      scope: scopes,
    }).toString(),
  })

  const refreshResult = await res.json()
  
  if (!res.ok) {
    console.error('[eBay] Token refresh failed:', JSON.stringify(refreshResult))
    throw new Error(`Token refresh failed: ${refreshResult.error_description || res.status}`)
  }

  console.log('[eBay] Token refreshed successfully')

  // Save new tokens
  const newTokens = {
    ...tokens,
    access_token: refreshResult.access_token,
    expires_in: refreshResult.expires_in,
    refreshed_at: new Date().toISOString(),
  }

  await supabase
    .from('system_settings')
    .update({ key_value: newTokens, updated_at: new Date().toISOString() })
    .eq('key_name', `EBAY_TOKENS_${storeKey}`)

  return refreshResult.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { store_key, action } = await req.json()
    const storeKey = store_key || 'hawaii'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Step 1: Refresh token
    const accessToken = await refreshToken(supabase, storeKey)

    const webhookEndpoint = `${supabaseUrl}/functions/v1/ebay-order-webhook`
    const verificationToken = Deno.env.get('EBAY_VERIFICATION_TOKEN') || ''
    console.log(`[eBay Subscription] Verification token length: ${verificationToken.length}, empty: ${!verificationToken}`)
    const results: Record<string, any> = {}

    // Step 2: List existing subscriptions & destinations
    const [subsRes, destsRes, topicsRes] = await Promise.all([
      fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }),
      fetch('https://api.ebay.com/commerce/notification/v1/destination', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }),
      fetch('https://api.ebay.com/commerce/notification/v1/topic', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
    ])

    results.existingSubscriptions = await subsRes.json()
    results.existingDestinations = await destsRes.json()
    results.availableTopics = await topicsRes.json()

    if (action === 'list_only') {
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 3: Create destination
    console.log(`[eBay Subscription] Creating destination: ${webhookEndpoint}`)
    const destRes = await fetch('https://api.ebay.com/commerce/notification/v1/destination', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `AlohaCardShop_${storeKey}_OrderWebhook`,
        status: 'ENABLED',
        deliveryConfig: {
          endpoint: webhookEndpoint,
          verificationToken: verificationToken
        }
      })
    })

    const destStatus = destRes.status
    const destLocationHeader = destRes.headers.get('Location')
    const destBody = await destRes.text()
    console.log(`[eBay Subscription] Destination ${destStatus}:`, destBody, 'Location:', destLocationHeader)

    let destinationId = destLocationHeader?.split('/').pop()
    try {
      const parsed = JSON.parse(destBody)
      if (parsed.destinationId) destinationId = parsed.destinationId
    } catch {}

    results.destination = { status: destStatus, body: destBody, location: destLocationHeader, destinationId }

    if (!destinationId && destStatus !== 200 && destStatus !== 201 && destStatus !== 409) {
      return new Response(JSON.stringify({ error: 'Failed to create destination', ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // If 409 conflict, destination already exists - find it
    if (destStatus === 409 || !destinationId) {
      const existingDests = results.existingDestinations
      if (existingDests?.destinations) {
        const match = existingDests.destinations.find((d: any) => 
          d.deliveryConfig?.endpoint === webhookEndpoint
        )
        if (match) {
          destinationId = match.destinationId
          console.log(`[eBay Subscription] Using existing destination: ${destinationId}`)
        }
      }
    }

    // Step 4: Create subscription for order topics
    const orderTopics = ['ORDER_CONFIRMATION']
    
    for (const topic of orderTopics) {
      console.log(`[eBay Subscription] Creating subscription for ${topic}`)
      const subRes = await fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicId: topic,
          status: 'ENABLED',
          payload: { 
            format: 'JSON',
            deliveryProtocol: 'HTTPS',
            schemaVersion: '1.0'
          },
          destinationId: destinationId
        })
      })

      const subStatus = subRes.status
      const subBody = await subRes.text()
      console.log(`[eBay Subscription] ${topic} => ${subStatus}:`, subBody)
      results[`subscription_${topic}`] = { status: subStatus, body: subBody }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[eBay Subscription] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
