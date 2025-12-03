import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken, ebayApiRequest } from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PolicySyncResult {
  fulfillment: number
  payment: number
  return: number
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get store config to determine environment and marketplace
    const { data: storeConfig, error: configError } = await supabase
      .from('ebay_store_config')
      .select('environment, marketplace_id')
      .eq('store_key', store_key)
      .single()

    if (configError || !storeConfig) {
      return new Response(
        JSON.stringify({ error: `Store config not found for: ${store_key}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const environment = storeConfig.environment as 'sandbox' | 'production'
    const marketplaceId = storeConfig.marketplace_id

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, store_key, environment)

    const result: PolicySyncResult = {
      fulfillment: 0,
      payment: 0,
      return: 0
    }

    // Sync fulfillment policies
    console.log(`Syncing fulfillment policies for ${store_key}...`)
    const fulfillmentResponse = await ebayApiRequest(
      accessToken,
      environment,
      'GET',
      `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`
    )

    if (fulfillmentResponse.ok) {
      const fulfillmentData = await fulfillmentResponse.json()
      const policies = fulfillmentData.fulfillmentPolicies || []
      
      for (const policy of policies) {
        await supabase
          .from('ebay_fulfillment_policies')
          .upsert({
            store_key,
            policy_id: policy.fulfillmentPolicyId,
            name: policy.name,
            description: policy.description || null,
            marketplace_id: policy.marketplaceId,
            shipping_options: policy.shippingOptions || null,
            handling_time: policy.handlingTime || null,
            is_default: policy.default || false,
            synced_at: new Date().toISOString()
          }, { onConflict: 'store_key,policy_id' })
        
        result.fulfillment++
      }
    } else {
      console.error('Failed to fetch fulfillment policies:', await fulfillmentResponse.text())
    }

    // Sync payment policies
    console.log(`Syncing payment policies for ${store_key}...`)
    const paymentResponse = await ebayApiRequest(
      accessToken,
      environment,
      'GET',
      `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`
    )

    if (paymentResponse.ok) {
      const paymentData = await paymentResponse.json()
      const policies = paymentData.paymentPolicies || []
      
      for (const policy of policies) {
        await supabase
          .from('ebay_payment_policies')
          .upsert({
            store_key,
            policy_id: policy.paymentPolicyId,
            name: policy.name,
            description: policy.description || null,
            marketplace_id: policy.marketplaceId,
            payment_methods: policy.paymentMethods || null,
            is_default: policy.default || false,
            synced_at: new Date().toISOString()
          }, { onConflict: 'store_key,policy_id' })
        
        result.payment++
      }
    } else {
      console.error('Failed to fetch payment policies:', await paymentResponse.text())
    }

    // Sync return policies
    console.log(`Syncing return policies for ${store_key}...`)
    const returnResponse = await ebayApiRequest(
      accessToken,
      environment,
      'GET',
      `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`
    )

    if (returnResponse.ok) {
      const returnData = await returnResponse.json()
      const policies = returnData.returnPolicies || []
      
      for (const policy of policies) {
        await supabase
          .from('ebay_return_policies')
          .upsert({
            store_key,
            policy_id: policy.returnPolicyId,
            name: policy.name,
            description: policy.description || null,
            marketplace_id: policy.marketplaceId,
            returns_accepted: policy.returnsAccepted || false,
            return_period: policy.returnPeriod?.value ? `${policy.returnPeriod.value} ${policy.returnPeriod.unit}` : null,
            refund_method: policy.refundMethod || null,
            is_default: policy.default || false,
            synced_at: new Date().toISOString()
          }, { onConflict: 'store_key,policy_id' })
        
        result.return++
      }
    } else {
      console.error('Failed to fetch return policies:', await returnResponse.text())
    }

    console.log(`Policy sync complete for ${store_key}:`, result)

    return new Response(
      JSON.stringify({
        success: true,
        synced: result,
        message: `Synced ${result.fulfillment} fulfillment, ${result.payment} payment, ${result.return} return policies`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error syncing eBay policies:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
