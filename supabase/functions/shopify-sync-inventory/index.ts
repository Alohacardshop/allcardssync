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
  correlationId?: string
  validateOnly?: boolean
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
    const { storeKey, sku, locationGid, correlationId, validateOnly }: SyncRequest = await req.json()
    const logPrefix = correlationId ? `[${correlationId}]` : '[shopify-sync]'
    const mode = validateOnly ? 'VALIDATE' : 'SYNC'
    
    if (!storeKey || !sku) {
      log.error('Missing required parameters', { storeKey, sku, correlationId })
      return new Response(
        JSON.stringify({ error: 'storeKey and sku are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    log.info(`${logPrefix} Starting inventory ${mode.toLowerCase()}`, { storeKey, sku, locationGid, correlationId, validateOnly })
    const startTime = Date.now()

    // Get Shopify store configuration - standardized naming with fallbacks
    const upper = storeKey.toUpperCase()
    const domainKeys = [
      `SHOPIFY_${upper}_STORE_DOMAIN`,     // New standard pattern
      `SHOPIFY_${upper}_DOMAIN`,           // Legacy pattern
      `SHOPIFY_STORE_DOMAIN_${upper}`,     // Another legacy pattern
      'SHOPIFY_STORE_DOMAIN'               // Fallback pattern
    ]
    const tokenKeys = [
      `SHOPIFY_${upper}_ACCESS_TOKEN`,     // New standard pattern
      `SHOPIFY_ADMIN_ACCESS_TOKEN_${upper}`, // Legacy pattern
      'SHOPIFY_ADMIN_ACCESS_TOKEN'         // Fallback pattern
    ]

    const { data: storeConfig, error: configError } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', [...domainKeys, ...tokenKeys])

    if (configError) {
      log.error('Failed to get store config', { storeKey, error: configError })
      return new Response(
        JSON.stringify({ error: 'Failed to get store configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!storeConfig || storeConfig.length === 0) {
      log.error('No Shopify configuration found', { storeKey, searchedKeys: [...domainKeys, ...tokenKeys] })
      return new Response(
        JSON.stringify({ 
          error: `No Shopify store configuration found for '${storeKey}'. Please configure Shopify settings in Admin.`,
          searched_keys: [...domainKeys, ...tokenKeys]
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find domain and token values from any matching pattern
    const getSettingValue = (keys: string[]) => {
      for (const key of keys) {
        const setting = storeConfig.find(s => s.key_name === key)
        if (setting?.key_value) return setting.key_value
      }
      return null
    }

    const configMap = {
      domain: getSettingValue(domainKeys),
      access_token: getSettingValue(tokenKeys)
    }

    if (!configMap.domain || !configMap.access_token) {
      log.error('Missing Shopify configuration', { 
        storeKey, 
        hasDomain: !!configMap.domain, 
        hasToken: !!configMap.access_token,
        availableKeys: storeConfig.map(s => s.key_name)
      })
      return new Response(
        JSON.stringify({ 
          error: `Missing Shopify store configuration for '${storeKey}'.`,
          missing: {
            domain: !configMap.domain ? `Need one of: ${domainKeys.join(', ')}` : 'OK',
            token: !configMap.access_token ? `Need one of: ${tokenKeys.join(', ')}` : 'OK'
          },
          found_keys: storeConfig.map(s => s.key_name)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Query inventory totals per location - scoped by store_key
    const queryStart = Date.now()
    const { data: locationBuckets, error: queryError } = await supabase
      .from('intake_items')
      .select('shopify_location_gid, quantity')
      .eq('sku', sku)
      .eq('store_key', storeKey)
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

    log.info(`${logPrefix} Computed location totals`, { sku, locationTotals, rowsConsidered: locationBuckets.length, queryMs, correlationId })

    // Resolve inventory_item_id for this SKU
    let inventoryItemId: string | null = null
    
    // Try to get from existing items first - scoped by store_key
    const { data: existingItem } = await supabase
      .from('intake_items')
      .select('shopify_inventory_item_id')
      .eq('sku', sku)
      .eq('store_key', storeKey)
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
      const message = `Could not resolve inventory_item_id for SKU: ${sku} in store: ${storeKey}`
      log.warn(message, { sku, storeKey, validateOnly })
      return new Response(
        JSON.stringify({ 
          [validateOnly ? 'validation_error' : 'warning']: message, 
          sku,
          storeKey,
          valid: false 
        }),
        { status: validateOnly ? 400 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // If validation only, return early with success
    if (validateOnly) {
      log.info(`${logPrefix} Validation completed successfully`, {
        storeKey, sku, inventoryItemId, locationTotals, valid: true
      })
      return new Response(
        JSON.stringify({ 
          valid: true, 
          sku, 
          storeKey,
          inventory_item_id: inventoryItemId,
          location_totals: locationTotals,
          message: 'Validation successful - ready for sync'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    log.info(`${logPrefix} Inventory sync completed`, {
      storeKey,
      sku,
      correlationId,
      per_location: syncResults,
      total_rows_considered: locationBuckets.length,
      totals_query_ms: queryMs,
      shopify_calls_ms: shopifyCallsMs,
      total_ms: totalMs
    })

    // D) Update sync status in database - mark as synced or error
    const locationResults = syncResults;
    const hasErrors = locationResults.some(r => r.outcome && !r.outcome.includes('success'));
    const syncStatus = hasErrors ? 'error' : 'synced';
    const errorMessage = hasErrors 
      ? locationResults.filter(r => r.outcome && !r.outcome.includes('success')).map(r => r.outcome).join('; ')
      : null;

    try {
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          shopify_sync_status: syncStatus,
          last_shopify_synced_at: syncStatus === 'synced' ? new Date().toISOString() : undefined,
          last_shopify_sync_error: errorMessage
        })
        .eq('sku', sku)
        .eq('store_key', storeKey);

      if (updateError) {
        console.warn('Failed to update sync status:', updateError);
      }
    } catch (statusError) {
      console.warn('Error updating sync status:', statusError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sku, 
        storeKey,
        results: syncResults,
        syncStatus,
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
    
    // D) Mark as error in database on exception
    try {
      await supabase
        .from('intake_items')
        .update({
          shopify_sync_status: 'error',
          last_shopify_sync_error: error.message || 'Internal server error'
        })
        .eq('sku', sku)
        .eq('store_key', storeKey);
    } catch (statusError) {
      console.warn('Error updating sync status on exception:', statusError);
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})