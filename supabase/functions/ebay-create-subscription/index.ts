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
    const { store_key, topic } = await req.json()
    const storeKey = store_key || 'hawaii'
    const subscriptionTopic = topic || 'MARKETPLACE.ORDER.CREATED'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get stored token
    const { data: tokenData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `EBAY_TOKENS_${storeKey}`)
      .single()

    if (!tokenData) {
      return new Response(JSON.stringify({ error: 'No eBay token found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tokens = typeof tokenData.key_value === 'string' 
      ? JSON.parse(tokenData.key_value) 
      : tokenData.key_value
    const accessToken = tokens.access_token

    const endpoint = `${supabaseUrl}/functions/v1/ebay-order-webhook`

    // First, list existing subscriptions
    console.log('[eBay Subscription] Listing existing subscriptions...')
    const listRes = await fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const existingSubs = await listRes.json()
    console.log('[eBay Subscription] Existing:', JSON.stringify(existingSubs))

    // Create subscription
    console.log(`[eBay Subscription] Creating subscription for topic: ${subscriptionTopic}`)
    const createRes = await fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        topicId: subscriptionTopic,
        status: 'ENABLED',
        payload: {
          format: 'JSON'
        },
        destinationId: endpoint
      })
    })

    const status = createRes.status
    const responseText = await createRes.text()
    let responseBody
    try { responseBody = JSON.parse(responseText) } catch { responseBody = responseText }

    console.log(`[eBay Subscription] Response ${status}:`, responseText)

    // If we need to create a destination first
    if (status === 400 || status === 404) {
      console.log('[eBay Subscription] Trying to create destination first...')
      
      const destRes = await fetch('https://api.ebay.com/commerce/notification/v1/destination', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: 'AlohaCardShop_OrderWebhook',
          status: 'ENABLED',
          deliveryConfig: {
            endpoint: endpoint,
            verificationToken: Deno.env.get('EBAY_VERIFICATION_TOKEN') || ''
          }
        })
      })

      const destStatus = destRes.status
      const destText = await destRes.text()
      console.log(`[eBay Subscription] Destination response ${destStatus}:`, destText)

      let destBody
      try { destBody = JSON.parse(destText) } catch { destBody = destText }

      // Get destination ID from Location header or response
      const locationHeader = destRes.headers.get('Location')
      let destinationId = locationHeader?.split('/').pop()
      if (!destinationId && destBody?.destinationId) {
        destinationId = destBody.destinationId
      }

      if (destinationId || destStatus === 200 || destStatus === 201) {
        // Now create subscription with destination ID
        console.log(`[eBay Subscription] Retrying subscription with destinationId: ${destinationId}`)
        
        const retryRes = await fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            topicId: subscriptionTopic,
            status: 'ENABLED',
            payload: { format: 'JSON' },
            destinationId: destinationId
          })
        })

        const retryStatus = retryRes.status
        const retryText = await retryRes.text()
        console.log(`[eBay Subscription] Retry response ${retryStatus}:`, retryText)

        return new Response(JSON.stringify({
          step: 'subscription_with_destination',
          destinationId,
          subscriptionStatus: retryStatus,
          subscriptionResponse: retryText,
          existingSubscriptions: existingSubs
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        step: 'destination_creation',
        destinationStatus: destStatus,
        destinationResponse: destBody,
        initialError: responseBody,
        existingSubscriptions: existingSubs
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      step: 'direct_subscription',
      status,
      response: responseBody,
      existingSubscriptions: existingSubs
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[eBay Subscription] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
