import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken, ebayApiRequest } from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FulfillmentPolicyRequest {
  name: string
  description?: string
  marketplaceId: string
  handlingTime: {
    value: number
    unit: 'DAY' | 'BUSINESS_DAY'
  }
  shippingOptions: Array<{
    optionType: 'DOMESTIC' | 'INTERNATIONAL'
    costType: 'FLAT_RATE' | 'CALCULATED' | 'NOT_SPECIFIED'
    shippingServices?: Array<{
      shippingServiceCode: string
      shippingCost?: { value: string; currency: string }
      additionalShippingCost?: { value: string; currency: string }
      freeShipping?: boolean
      sortOrder?: number
    }>
  }>
  globalShipping?: boolean
  freightShipping?: boolean
  pickupDropOff?: boolean
}

interface PaymentPolicyRequest {
  name: string
  description?: string
  marketplaceId: string
  immediatePay?: boolean
  paymentMethods?: Array<{
    paymentMethodType: 'CASH_ON_DELIVERY' | 'CASH_ON_PICKUP' | 'CREDIT_CARD' | 'PAYPAL' | 'PERSONAL_CHECK'
    recipientAccountReference?: {
      referenceId: string
      referenceType: string
    }
  }>
}

interface ReturnPolicyRequest {
  name: string
  description?: string
  marketplaceId: string
  returnsAccepted: boolean
  returnPeriod?: {
    value: number
    unit: 'DAY' | 'CALENDAR_DAY' | 'BUSINESS_DAY' | 'YEAR' | 'MONTH'
  }
  refundMethod?: 'MERCHANDISE_CREDIT' | 'MONEY_BACK'
  returnShippingCostPayer?: 'BUYER' | 'SELLER'
  returnMethod?: 'EXCHANGE' | 'REPLACEMENT'
}

type PolicyType = 'fulfillment' | 'payment' | 'return'
type Operation = 'create' | 'update' | 'delete'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { store_key, policy_type, operation, policy_id, policy_data } = await req.json() as {
      store_key: string
      policy_type: PolicyType
      operation: Operation
      policy_id?: string
      policy_data?: FulfillmentPolicyRequest | PaymentPolicyRequest | ReturnPolicyRequest
    }

    if (!store_key || !policy_type || !operation) {
      return new Response(
        JSON.stringify({ error: 'store_key, policy_type, and operation are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get store config
    const { data: storeConfig, error: configError } = await supabase
      .from('ebay_store_config')
      .select('*')
      .eq('store_key', store_key)
      .single()

    if (configError || !storeConfig) {
      return new Response(
        JSON.stringify({ error: `Store config not found: ${store_key}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!storeConfig.oauth_connected_at) {
      return new Response(
        JSON.stringify({ error: 'eBay not connected for this store' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const environment = storeConfig.environment as 'sandbox' | 'production'
    const accessToken = await getValidAccessToken(supabase, store_key, environment)

    // Map policy type to eBay API endpoint
    const policyEndpoints: Record<PolicyType, string> = {
      fulfillment: '/sell/account/v1/fulfillment_policy',
      payment: '/sell/account/v1/payment_policy',
      return: '/sell/account/v1/return_policy',
    }

    const policyIdFields: Record<PolicyType, string> = {
      fulfillment: 'fulfillmentPolicyId',
      payment: 'paymentPolicyId',
      return: 'returnPolicyId',
    }

    const baseEndpoint = policyEndpoints[policy_type]
    const idField = policyIdFields[policy_type]

    let response: Response
    let result: any

    switch (operation) {
      case 'create': {
        if (!policy_data) {
          return new Response(
            JSON.stringify({ error: 'policy_data is required for create operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Creating ${policy_type} policy for ${store_key}:`, policy_data.name)
        
        response = await ebayApiRequest(accessToken, environment, 'POST', baseEndpoint, policy_data)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Create policy failed:`, errorText)
          return new Response(
            JSON.stringify({ error: `Failed to create policy: ${errorText}` }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        result = await response.json()
        const newPolicyId = result[idField]

        // Sync to local DB
        await syncPolicyToDb(supabase, store_key, policy_type, newPolicyId, policy_data, storeConfig.marketplace_id)

        console.log(`Created ${policy_type} policy: ${newPolicyId}`)
        return new Response(
          JSON.stringify({ success: true, policy_id: newPolicyId, message: 'Policy created successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update': {
        if (!policy_id || !policy_data) {
          return new Response(
            JSON.stringify({ error: 'policy_id and policy_data are required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Updating ${policy_type} policy ${policy_id} for ${store_key}`)
        
        response = await ebayApiRequest(accessToken, environment, 'PUT', `${baseEndpoint}/${policy_id}`, policy_data)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Update policy failed:`, errorText)
          return new Response(
            JSON.stringify({ error: `Failed to update policy: ${errorText}` }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Sync to local DB
        await syncPolicyToDb(supabase, store_key, policy_type, policy_id, policy_data, storeConfig.marketplace_id)

        console.log(`Updated ${policy_type} policy: ${policy_id}`)
        return new Response(
          JSON.stringify({ success: true, policy_id, message: 'Policy updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete': {
        if (!policy_id) {
          return new Response(
            JSON.stringify({ error: 'policy_id is required for delete operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Deleting ${policy_type} policy ${policy_id} for ${store_key}`)
        
        response = await ebayApiRequest(accessToken, environment, 'DELETE', `${baseEndpoint}/${policy_id}`)
        
        if (!response.ok && response.status !== 204) {
          const errorText = await response.text()
          console.error(`Delete policy failed:`, errorText)
          return new Response(
            JSON.stringify({ error: `Failed to delete policy: ${errorText}` }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Remove from local DB
        const tableNames: Record<PolicyType, string> = {
          fulfillment: 'ebay_fulfillment_policies',
          payment: 'ebay_payment_policies',
          return: 'ebay_return_policies',
        }

        await supabase
          .from(tableNames[policy_type])
          .delete()
          .eq('store_key', store_key)
          .eq('policy_id', policy_id)

        console.log(`Deleted ${policy_type} policy: ${policy_id}`)
        return new Response(
          JSON.stringify({ success: true, message: 'Policy deleted successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: `Invalid operation: ${operation}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error: any) {
    console.error('[ebay-manage-policy] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function syncPolicyToDb(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  policyType: PolicyType,
  policyId: string,
  policyData: any,
  marketplaceId: string
) {
  const tableNames: Record<PolicyType, string> = {
    fulfillment: 'ebay_fulfillment_policies',
    payment: 'ebay_payment_policies',
    return: 'ebay_return_policies',
  }

  const baseData = {
    store_key: storeKey,
    policy_id: policyId,
    name: policyData.name,
    description: policyData.description || null,
    marketplace_id: marketplaceId,
    is_default: false,
    synced_at: new Date().toISOString(),
  }

  let specificData = {}

  if (policyType === 'fulfillment') {
    specificData = {
      shipping_options: policyData.shippingOptions || null,
      handling_time: policyData.handlingTime || null,
    }
  } else if (policyType === 'payment') {
    specificData = {
      payment_methods: policyData.paymentMethods || null,
    }
  } else if (policyType === 'return') {
    specificData = {
      returns_accepted: policyData.returnsAccepted || false,
      return_period: policyData.returnPeriod ? `${policyData.returnPeriod.value} ${policyData.returnPeriod.unit}` : null,
      refund_method: policyData.refundMethod || null,
    }
  }

  await supabase
    .from(tableNames[policyType])
    .upsert({ ...baseData, ...specificData }, { onConflict: 'store_key,policy_id' })
}
