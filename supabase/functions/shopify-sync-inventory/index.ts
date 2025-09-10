import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Exponential backoff for Shopify API calls
async function shopifyApiCall(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options)
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '2'
        const delay = Math.min(parseInt(retryAfter) * 1000, 5000)
        console.log(`Rate limited, retrying after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      if (response.status >= 500 && i < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 10000)
        console.log(`Server error ${response.status}, retrying after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      return response
    } catch (error) {
      if (i === retries - 1) throw error
      const delay = Math.min(1000 * Math.pow(2, i), 10000)
      console.log(`Network error, retrying after ${delay}ms:`, error)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('All retries exhausted')
}

interface SyncRequest {
  storeKey: string
  sku: string
  locationGid?: string
  correlationId?: string
  validateOnly?: boolean
}

interface LocationBucket {
  locationId: string
  locationName?: string
  totalQuantity: number
}

Deno.serve(async (req) => {
  const startTime = Date.now()
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('shopify-sync-inventory: Starting request')
    
    // Parse request
    const body = await req.json() as SyncRequest
    const { storeKey, sku, locationGid, correlationId, validateOnly = false } = body

    if (!storeKey || !sku) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          code: 'INVALID_REQUEST', 
          message: 'Missing required fields: storeKey, sku' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`shopify-sync-inventory: Processing ${storeKey}/${sku}, validateOnly: ${validateOnly}`)

    // Resolve Shopify credentials using shared resolver
    const configResult = await resolveShopifyConfig(supabase, storeKey)
    
    if (!configResult.ok) {
      console.error('shopify-sync-inventory: Config resolution failed:', configResult.message)
      
      // Update database with error status
      try {
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: configResult.message
          })
          .eq('sku', sku)
          .eq('store_key', storeKey)
      } catch (updateError) {
        console.warn('Failed to update sync status for config error:', updateError)
      }
      
      return new Response(
        JSON.stringify(configResult),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { credentials, diagnostics } = configResult
    console.log('shopify-sync-inventory: Credentials resolved:', diagnostics)

    // Query inventory totals per location - scoped by store_key
    const queryStart = Date.now()
    const { data: locationBuckets, error: queryError } = await supabase
      .from('intake_items')
      .select('shopify_location_gid, quantity, shopify_product_id, shopify_variant_id, shopify_inventory_item_id')
      .eq('sku', sku)
      .eq('store_key', storeKey)
      .is('deleted_at', null)
      .not('removed_from_batch_at', 'is', null)
      .gt('quantity', 0)

    if (queryError) {
      console.error('Failed to query inventory', { sku, error: queryError })
      return new Response(
        JSON.stringify({ error: 'Failed to query inventory' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate required shopify_location_gid
    const itemsWithoutLocation = locationBuckets.filter(item => !item.shopify_location_gid)
    if (itemsWithoutLocation.length > 0) {
      const message = `Items missing shopify_location_gid - choose a location before syncing`
      console.warn(message, { sku, storeKey, missingLocationCount: itemsWithoutLocation.length })
      
      try {
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: message
          })
          .eq('sku', sku)
          .eq('store_key', storeKey)
          .is('shopify_location_gid', null)
      } catch (updateError) {
        console.warn('Failed to update sync status for missing location', { updateError })
      }
      
      return new Response(
        JSON.stringify({ 
          ok: false,
          code: 'MISSING_LOCATION',
          message, 
          sku,
          storeKey,
          itemsWithoutLocation: itemsWithoutLocation.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const queryMs = Date.now() - queryStart

    // Group by location and sum quantities
    const locationTotals = locationBuckets.reduce((acc, item) => {
      const locationKey = item.shopify_location_gid || 'default'
      acc[locationKey] = (acc[locationKey] || 0) + item.quantity
      return acc
    }, {} as Record<string, number>)

    console.log(`shopify-sync-inventory: Computed location totals`, { sku, locationTotals, rowsConsidered: locationBuckets.length, queryMs, correlationId })

    // Resolve inventory_item_id for this SKU
    let inventoryItemId: string | null = null
    let resolvedProductId: string | null = null
    let resolvedVariantId: string | null = null
    
    // Try to get from existing items first - scoped by store_key
    const { data: existingItem } = await supabase
      .from('intake_items')
      .select('shopify_inventory_item_id, shopify_product_id, shopify_variant_id')
      .eq('sku', sku)
      .eq('store_key', storeKey)
      .not('shopify_inventory_item_id', 'is', null)
      .limit(1)
      .single()

    if (existingItem?.shopify_inventory_item_id) {
      inventoryItemId = existingItem.shopify_inventory_item_id
      resolvedProductId = existingItem.shopify_product_id
      resolvedVariantId = existingItem.shopify_variant_id
    } else {
      // Resolve via Shopify API - check for duplicates first
      try {
        const variantResponse = await shopifyApiCall(
          `https://${credentials.domain}/admin/api/2024-07/variants.json?sku=${encodeURIComponent(sku)}&limit=250`,
          {
            headers: {
              'X-Shopify-Access-Token': credentials.accessToken,
              'Content-Type': 'application/json',
            }
          }
        )

        if (variantResponse.ok) {
          const variantData = await variantResponse.json()
          if (variantData.variants?.length > 1) {
            // Multiple variants found - require explicit selection
            const message = `Multiple variants found for SKU ${sku} - use inspector to attach to specific variant`
            console.warn(message, { sku, storeKey, variantCount: variantData.variants.length })
            
            try {
              await supabase
                .from('intake_items')
                .update({
                  shopify_sync_status: 'error',
                  last_shopify_sync_error: message
                })
                .eq('sku', sku)
                .eq('store_key', storeKey)
            } catch (updateError) {
              console.warn('Failed to update sync status for duplicate SKU', { updateError })
            }
            
            return new Response(
              JSON.stringify({ 
                ok: false,
                code: 'DUPLICATE_SKU',
                message, 
                sku,
                storeKey,
                variantCount: variantData.variants.length,
                variants: variantData.variants.map((v: any) => ({
                  id: v.id,
                  title: v.title,
                  product_id: v.product_id
                }))
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } else if (variantData.variants?.[0]) {
            const variant = variantData.variants[0]
            inventoryItemId = variant.inventory_item_id?.toString()
            resolvedProductId = variant.product_id?.toString()
            resolvedVariantId = variant.id?.toString()
            
            // Persist IDs immediately after resolution
            try {
              const updateData: any = {}
              if (resolvedProductId) updateData.shopify_product_id = resolvedProductId
              if (resolvedVariantId) updateData.shopify_variant_id = resolvedVariantId
              if (inventoryItemId) updateData.shopify_inventory_item_id = inventoryItemId
              
              if (Object.keys(updateData).length > 0) {
                await supabase
                  .from('intake_items')
                  .update(updateData)
                  .eq('sku', sku)
                  .eq('store_key', storeKey)
                console.log('Persisted resolved IDs:', { sku, storeKey, ...updateData })
              }
            } catch (persistError) {
              console.warn('Failed to persist resolved IDs', { persistError })
            }
          }
        }
      } catch (e) {
        console.warn('Failed to resolve IDs via Shopify API', { sku, error: e.message })
      }
    }

    if (!inventoryItemId) {
      const message = `Could not resolve inventory_item_id for SKU: ${sku} in store: ${storeKey}`
      console.warn(message, { sku, storeKey, validateOnly })
      
      // Always persist error status to database
      try {
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: message
          })
          .eq('sku', sku)
          .eq('store_key', storeKey)

        if (updateError) {
          console.warn('Failed to update sync status for missing inventory_item_id', { updateError })
        }
      } catch (statusError) {
        console.warn('Error updating sync status for missing inventory_item_id', { statusError })
      }
      
      return new Response(
        JSON.stringify({ 
          ok: false,
          code: 'NOT_FOUND',
          message, 
          sku,
          storeKey,
          diagnostics
        }),
        { status: validateOnly ? 400 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Shopify locations if needed
    let shopifyLocations: any[] = []
    try {
      const locationsResponse = await shopifyApiCall(
        `https://${credentials.domain}/admin/api/2024-07/locations.json`,
        {
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
            'Content-Type': 'application/json',
          }
        }
      )

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json()
        shopifyLocations = locationsData.locations || []
      }
    } catch (e) {
      console.error('Failed to fetch Shopify locations', { error: e.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Shopify locations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If validation only, persist success status and return early
    if (validateOnly) {
      // Update status to indicate validation passed
      try {
        const updateData: any = {
          shopify_sync_status: 'validated',
          last_shopify_synced_at: new Date().toISOString(),
          last_shopify_sync_error: null
        }

        // Persist discovered IDs for future syncs
        if (resolvedProductId) updateData.shopify_product_id = resolvedProductId
        if (resolvedVariantId) updateData.shopify_variant_id = resolvedVariantId
        if (inventoryItemId) updateData.shopify_inventory_item_id = inventoryItemId

        const { error: updateError } = await supabase
          .from('intake_items')
          .update(updateData)
          .eq('sku', sku)
          .eq('store_key', storeKey)

        if (updateError) {
          console.warn('Failed to update validation status', { updateError })
        }
      } catch (statusError) {
        console.warn('Error updating validation status', { statusError })
      }
      
      console.log(`shopify-sync-inventory: Validation completed successfully`, {
        storeKey, sku, inventoryItemId, locationTotals
      })
      return new Response(
        JSON.stringify({ 
          ok: true,
          valid: true, 
          sku, 
          storeKey,
          inventory_item_id: inventoryItemId,
          location_totals: locationTotals,
          message: 'Validation successful - ready for sync',
          diagnostics
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
        console.error('Could not resolve location_id', { locationKey, sku })
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
        const setResponse = await shopifyApiCall(
          `https://${credentials.domain}/admin/api/2024-07/inventory_levels/set.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': credentials.accessToken,
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
          console.error('Shopify inventory set failed', { 
            sku, locationId, inventoryItemId, total, 
            status: setResponse.status, 
            error: errorText 
          })
        }
      } catch (e) {
        console.error('Exception during inventory set', { sku, locationId, inventoryItemId, total, error: e.message })
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

    console.log(`shopify-sync-inventory: Inventory sync completed`, {
      storeKey,
      sku,
      correlationId,
      per_location: syncResults,
      total_rows_considered: locationBuckets.length,
      totals_query_ms: queryMs,
      shopify_calls_ms: shopifyCallsMs,
      total_ms: totalMs
    })

    // Update sync status in database - mark as synced or error
    const hasErrors = syncResults.some(r => r.outcome && !r.outcome.includes('success'));
    const syncStatus = hasErrors ? 'error' : 'synced';
    const errorMessage = hasErrors 
      ? syncResults.filter(r => r.outcome && !r.outcome.includes('success')).map(r => r.outcome).join('; ')
      : null;

    try {
      const updateData: any = {
        shopify_sync_status: syncStatus,
        last_shopify_sync_error: errorMessage
      }

      // Always update synced timestamp on success
      if (syncStatus === 'synced') {
        updateData.last_shopify_synced_at = new Date().toISOString();
        updateData.last_shopify_sync_error = null;
      }

      // Persist discovered IDs for future syncs
      if (resolvedProductId) updateData.shopify_product_id = resolvedProductId;
      if (resolvedVariantId) updateData.shopify_variant_id = resolvedVariantId;
      if (inventoryItemId) updateData.shopify_inventory_item_id = inventoryItemId;

      const { error: updateError } = await supabase
        .from('intake_items')
        .update(updateData)
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
        ok: true,
        success: true, 
        sku, 
        storeKey,
        results: syncResults,
        syncStatus,
        diagnostics,
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
    console.error('shopify-sync-inventory: Error -', error)
    
    // Extract request data for status update
    let sku: string | undefined
    let storeKey: string | undefined
    try {
      const requestData = await req.clone().json() as SyncRequest
      sku = requestData.sku
      storeKey = requestData.storeKey
    } catch (e) {
      // Request already consumed or malformed
    }
    
    // Mark as error in database on exception if we have the required data
    if (sku && storeKey) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: error.message || 'Internal server error'
          })
          .eq('sku', sku)
          .eq('store_key', storeKey)
      } catch (statusError) {
        console.warn('Error updating sync status on exception', { statusError })
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: false,
        error: 'Internal server error',
        message: error.message,
        diagnostics: {
          storeKey: storeKey || 'unknown',
          ms: Date.now() - startTime
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})