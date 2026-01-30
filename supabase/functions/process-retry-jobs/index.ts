import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RetryJob {
  id: string
  job_type: 'END_EBAY' | 'SET_SHOPIFY_ZERO' | 'ENFORCE_LOCATION'
  sku: string
  payload: Record<string, any>
  attempts: number
  max_attempts: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    console.log('[process-retry-jobs] Starting job processing...')

    // Step 1: Claim jobs atomically
    const { data: jobs, error: claimError } = await supabase.rpc('claim_retry_jobs', {
      p_limit: 10
    })

    if (claimError) {
      console.error('[process-retry-jobs] Failed to claim jobs:', claimError)
      return new Response(
        JSON.stringify({ error: 'Failed to claim jobs', details: claimError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!jobs || jobs.length === 0) {
      console.log('[process-retry-jobs] No jobs to process')
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[process-retry-jobs] Claimed ${jobs.length} jobs`)

    const results: { job_id: string; job_type: string; success: boolean; error?: string }[] = []

    // Step 2: Process each job
    for (const job of jobs as RetryJob[]) {
      console.log(`[process-retry-jobs] Processing job ${job.id}: ${job.job_type} for SKU ${job.sku}`)

      try {
        let success = false
        let errorMessage: string | undefined

        switch (job.job_type) {
          case 'END_EBAY':
            const ebayResult = await processEndEbayJob(supabase, supabaseUrl, supabaseKey, job)
            success = ebayResult.success
            errorMessage = ebayResult.error
            break

          case 'SET_SHOPIFY_ZERO':
            const shopifyResult = await processShopifyZeroJob(supabase, job)
            success = shopifyResult.success
            errorMessage = shopifyResult.error
            break

          case 'ENFORCE_LOCATION':
            const enforceResult = await processEnforceLocationJob(supabase, supabaseUrl, supabaseKey, job)
            success = enforceResult.success
            errorMessage = enforceResult.error
            break

          default:
            console.warn(`[process-retry-jobs] Unknown job type: ${job.job_type}`)
            errorMessage = `Unknown job type: ${job.job_type}`
        }

        if (success) {
          await supabase.rpc('complete_retry_job', { p_job_id: job.id })
          console.log(`[process-retry-jobs] ✓ Job ${job.id} completed successfully`)
        } else {
          await supabase.rpc('fail_retry_job', {
            p_job_id: job.id,
            p_error: errorMessage || 'Unknown error'
          })
          console.error(`[process-retry-jobs] ✗ Job ${job.id} failed: ${errorMessage}`)
        }

        results.push({
          job_id: job.id,
          job_type: job.job_type,
          success,
          error: errorMessage
        })

      } catch (jobError: any) {
        console.error(`[process-retry-jobs] Error processing job ${job.id}:`, jobError)
        
        await supabase.rpc('fail_retry_job', {
          p_job_id: job.id,
          p_error: jobError.message
        })

        results.push({
          job_id: job.id,
          job_type: job.job_type,
          success: false,
          error: jobError.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`[process-retry-jobs] Completed: ${successCount}/${results.length} jobs successful`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[process-retry-jobs] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function processEndEbayJob(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  job: RetryJob
): Promise<{ success: boolean; error?: string }> {
  const { sku, payload } = job
  const ebayOfferId = payload.ebay_offer_id

  if (!ebayOfferId) {
    return { success: false, error: 'Missing ebay_offer_id in payload' }
  }

  // Get store key from card
  const { data: card } = await supabase
    .from('cards')
    .select('sku')
    .eq('sku', sku)
    .single()

  if (!card) {
    return { success: false, error: 'Card not found' }
  }

  // Call ebay-update-inventory to set quantity to 0
  const response = await fetch(
    `${supabaseUrl}/functions/v1/ebay-update-inventory`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku,
        quantity: 0,
        store_key: payload.store_key || 'hawaii'
      })
    }
  )

  if (response.ok) {
    return { success: true }
  } else {
    const errorText = await response.text()
    return { success: false, error: `eBay API error: ${errorText}` }
  }
}

async function processShopifyZeroJob(
  supabase: any,
  job: RetryJob
): Promise<{ success: boolean; error?: string }> {
  const { payload } = job
  const { inventory_item_id, location_id, store_key } = payload

  if (!inventory_item_id || !location_id || !store_key) {
    return { success: false, error: 'Missing required payload fields' }
  }

  // Get Shopify credentials
  const storeKeyUpper = store_key.toUpperCase().replace(/_STORE$/i, '')
  
  const { data: credentials } = await supabase
    .from('system_settings')
    .select('key_name, key_value')
    .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`])

  const credMap = new Map(credentials?.map((c: any) => [c.key_name, c.key_value]) || [])
  const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
  const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)

  if (!domain || !token) {
    return { success: false, error: `No Shopify credentials for store: ${store_key}` }
  }

  const locationNumericId = location_id.replace('gid://shopify/Location/', '')

  const response = await fetch(
    `https://${domain}/admin/api/2024-07/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationNumericId,
        inventory_item_id: inventory_item_id,
        available: 0
      })
    }
  )

  if (response.ok) {
    return { success: true }
  } else {
    const errorText = await response.text()
    return { success: false, error: `Shopify API error: ${errorText}` }
  }
}

async function processEnforceLocationJob(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  job: RetryJob
): Promise<{ success: boolean; error?: string }> {
  const { sku, payload } = job
  const { desired_location_id, store_key } = payload

  if (!store_key) {
    return { success: false, error: 'Missing store_key in payload' }
  }

  // Call enforce-single-location-stock function
  const response = await fetch(
    `${supabaseUrl}/functions/v1/enforce-single-location-stock`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku,
        desired_location_id,
        store_key
      })
    }
  )

  if (response.ok) {
    return { success: true }
  } else {
    const errorText = await response.text()
    return { success: false, error: `Enforce location error: ${errorText}` }
  }
}
