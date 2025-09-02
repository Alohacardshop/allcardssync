import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithRetry } from '../_shared/http.ts'
import { log } from '../_shared/log.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncRequest {
  storeKey: string
  sku: string
  locationGid?: string
}

interface LocationBucket {
  shopify_location_gid: string | null
  total: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { storeKey, sku, locationGid }: SyncRequest = await req.json()
    
    if (!storeKey || !sku) {
      log.error('Missing required parameters', { storeKey, sku })
      return new Response(
        JSON.stringify({ error: 'storeKey and sku are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    log.info('Starting inventory sync', { storeKey, sku, locationGid })
    const startTime = Date.now()

    // Get Shopify store configuration
    const { data: storeConfig, error: configError } = await supabase
      .from('system_settings')
      .select('key_value')
      .in('key_name', [`SHOPIFY_${storeKey.toUpperCase()}_DOMAIN`, `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`])

    if (configError) {
      log.error('Failed to get store config', { storeKey, error: configError })
      return new Response(
        JSON.stringify({ error: 'Failed to get store configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const configMap = storeConfig.reduce((acc, setting) => {
      const key = setting.key_name.replace(`SHOPIFY_${storeKey.toUpperCase()}_`, '').toLowerCase()
      acc[key] = setting.key_value
      return acc
    }, {} as Record<string, string>)

    if (!configMap.domain || !configMap.access_token) {
      log.error('Missing Shopify configuration', { storeKey, hasDomain: !!configMap.domain, hasToken: !!configMap.access_token })
      return new Response(
        JSON.stringify({ error: 'Missing Shopify store configuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Query inventory totals per location
    const queryStart = Date.now()
    const { data: locationBuckets, error: queryError } = await supabase
      .from('intake_items')
      .select('shopify_location_gid, quantity')
      .eq('sku', sku)
      .is('deleted_at', null)
      .not('removed_from_batch_at', 'is', null)
      .gt('quantity', 0)

    if (queryError) {
      log.error('Failed to query inventory', { sku, error: queryError })
      return new Response(
        JSON.stringify({ error: 'Failed to query inventory' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const queryMs = Date.now() - queryStart

    // Group by location and sum quantities
    const locationTotals = locationBuckets.reduce((acc, item) => {
      const locationKey = item.shopify_location_gid || 'default'
      acc[locationKey] = (acc[locationKey] || 0) + item.quantity
      return acc
    }, {} as Record<string, number>)

    log.info('Computed location totals', { sku, locationTotals, rowsConsidered: locationBuckets.length, queryMs })

    // Resolve inventory_item_id for this SKU
    let inventoryItemId: string | null = null
    
    // Try to get from existing items first
    const { data: existingItem } = await supabase
      .from('intake_items')
      .select('shopify_inventory_item_id')
      .eq('sku', sku)
      .not('shopify_inventory_item_id', 'is', null)
      .limit(1)
      .single()

    if (existingItem?.shopify_inventory_item_id) {
      inventoryItemId = existingItem.shopify_inventory_item_id
    } else {
      // Resolve via Shopify API
      try {
        const variantResponse = await fetchWithRetry(
          `https://${configMap.domain}/admin/api/2024-07/variants.json?sku=${encodeURIComponent(sku)}&limit=1`,
          {
            headers: {
              'X-Shopify-Access-Token': configMap.access_token,
              'Content-Type': 'application/json',
            }
          }
        )

        if (variantResponse.ok) {
          const variantData = await variantResponse.json()
          if (variantData.variants?.[0]?.inventory_item_id) {
            inventoryItemId = variantData.variants[0].inventory_item_id.toString()
          }
        }
      } catch (e) {
        log.warn('Failed to resolve inventory_item_id via Shopify API', { sku, error: e.message })
      }
    }

    if (!inventoryItemId) {
      log.warn('Could not resolve inventory_item_id, skipping sync', { sku })
      return new Response(
        JSON.stringify({ warning: 'Could not resolve inventory_item_id for SKU', sku }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Shopify locations if needed
    let shopifyLocations: any[] = []
    try {
      const locationsResponse = await fetchWithRetry(
        `https://${configMap.domain}/admin/api/2024-07/locations.json`,
        {
          headers: {
            'X-Shopify-Access-Token': configMap.access_token,
            'Content-Type': 'application/json',
          }
        }
      )

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json()
        shopifyLocations = locationsData.locations || []
      }
    } catch (e) {
      log.error('Failed to fetch Shopify locations', { error: e.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Shopify locations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sync each location bucket
    const syncResults = []
    const shopifyCallsStart = Date.now()

    for (const [locationKey, total] of Object.entries(locationTotals)) {
      let locationId: string | null = null

      if (locationKey !== 'default' && locationKey) {
        // Parse location ID from GID (gid://shopify/Location/{id})
        const match = locationKey.match(/\/(\d+)$/)
        if (match) {
          locationId = match[1]
        }
      }

      // Fallback to primary/first active location
      if (!locationId && shopifyLocations.length > 0) {
        const primaryLocation = shopifyLocations.find(loc => loc.primary) || shopifyLocations.find(loc => loc.active) || shopifyLocations[0]
        locationId = primaryLocation?.id?.toString()
      }

      if (!locationId) {
        log.error('Could not resolve location_id', { locationKey, sku })
        syncResults.push({
          location_gid: locationKey,
          location_id: null,
          computed_available: total,
          inventory_item_id: inventoryItemId,
          outcome: 'error: no location_id'
        })
        continue
      }

      try {
        // Set inventory level in Shopify
        const setResponse = await fetchWithRetry(
          `https://${configMap.domain}/admin/api/2024-07/inventory_levels/set.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': configMap.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inventory_item_id: inventoryItemId,
              location_id: locationId,
              available: total
            })
          }
        )

        const outcome = setResponse.ok ? 'success' : `error: ${setResponse.status}`
        
        syncResults.push({
          location_gid: locationKey,
          location_id: locationId,
          computed_available: total,
          inventory_item_id: inventoryItemId,
          outcome
        })

        if (!setResponse.ok) {
          const errorText = await setResponse.text()
          log.error('Shopify inventory set failed', { 
            sku, locationId, inventoryItemId, total, 
            status: setResponse.status, 
            error: errorText 
          })
        }
      } catch (e) {
        log.error('Exception during inventory set', { sku, locationId, inventoryItemId, total, error: e.message })
        syncResults.push({
          location_gid: locationKey,
          location_id: locationId,
          computed_available: total,
          inventory_item_id: inventoryItemId,
          outcome: `exception: ${e.message}`
        })
      }
    }

    const shopifyCallsMs = Date.now() - shopifyCallsStart
    const totalMs = Date.now() - startTime

    log.info('Inventory sync completed', {
      storeKey,
      sku,
      per_location: syncResults,
      total_rows_considered: locationBuckets.length,
      totals_query_ms: queryMs,
      shopify_calls_ms: shopifyCallsMs,
      total_ms: totalMs
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        sku, 
        storeKey,
        results: syncResults,
        stats: {
          rowsConsidered: locationBuckets.length,
          queryMs,
          shopifyCallsMs,
          totalMs
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    log.error('Inventory sync failed', { error: error.message, stack: error.stack })
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})