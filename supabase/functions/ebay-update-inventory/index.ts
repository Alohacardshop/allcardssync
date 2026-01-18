import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getValidAccessToken,
  ebayApiRequest,
} from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateInventoryRequest {
  sku: string
  quantity: number
  store_key: string
  price?: number
}

interface BulkUpdateRequest {
  items: UpdateInventoryRequest[]
  store_key: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()
    
    // Support both single item and bulk updates
    const isBulk = Array.isArray(body.items)
    const items: UpdateInventoryRequest[] = isBulk ? body.items : [body]
    const storeKey = body.store_key || items[0]?.store_key

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'store_key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[ebay-update-inventory] Processing ${items.length} item(s) for store: ${storeKey}`)

    // Get store config
    const { data: storeConfig, error: configError } = await supabase
      .from('ebay_store_config')
      .select('*')
      .eq('store_key', storeKey)
      .single()

    if (configError || !storeConfig) {
      return new Response(
        JSON.stringify({ error: `Store config not found for: ${storeKey}` }),
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

    // Get access token
    const accessToken = await getValidAccessToken(supabase, storeKey, environment)

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as { sku: string; error: string }[],
      updates: [] as { sku: string; quantity: number; price?: number }[],
    }

    // Process each item
    for (const item of items) {
      results.processed++

      if (!item.sku) {
        results.failed++
        results.errors.push({ sku: 'unknown', error: 'SKU is required' })
        continue
      }

      try {
        // Get current inventory item from eBay
        const getResponse = await ebayApiRequest(
          accessToken,
          environment,
          'GET',
          `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`
        )

        if (!getResponse.ok) {
          const errorText = await getResponse.text()
          if (getResponse.status === 404) {
            results.failed++
            results.errors.push({ sku: item.sku, error: 'Item not found on eBay' })
            continue
          }
          throw new Error(`Failed to get inventory item: ${errorText}`)
        }

        const inventoryItem = await getResponse.json()

        // Update availability
        inventoryItem.availability = {
          ...inventoryItem.availability,
          shipToLocationAvailability: {
            ...inventoryItem.availability?.shipToLocationAvailability,
            quantity: item.quantity,
          },
        }

        // Update inventory item on eBay
        const updateResponse = await ebayApiRequest(
          accessToken,
          environment,
          'PUT',
          `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`,
          inventoryItem
        )

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          throw new Error(`Failed to update inventory: ${errorText}`)
        }

        // If price update requested, update the offer
        if (item.price !== undefined) {
          // Get offers for this SKU
          const offersResponse = await ebayApiRequest(
            accessToken,
            environment,
            'GET',
            `/sell/inventory/v1/offer?sku=${encodeURIComponent(item.sku)}`
          )

          if (offersResponse.ok) {
            const offersData = await offersResponse.json()
            const offers = offersData.offers || []

            for (const offer of offers) {
              if (offer.status === 'PUBLISHED') {
                // Update offer price and quantity
                const offerUpdate = {
                  ...offer,
                  availableQuantity: item.quantity,
                  pricingSummary: {
                    ...offer.pricingSummary,
                    price: {
                      value: item.price.toFixed(2),
                      currency: offer.pricingSummary?.price?.currency || 'USD',
                    },
                  },
                }

                // Remove read-only fields
                delete offerUpdate.offerId
                delete offerUpdate.status
                delete offerUpdate.listing

                const offerUpdateResponse = await ebayApiRequest(
                  accessToken,
                  environment,
                  'PUT',
                  `/sell/inventory/v1/offer/${offer.offerId}`,
                  offerUpdate
                )

                if (!offerUpdateResponse.ok) {
                  console.warn(`[ebay-update-inventory] Failed to update offer ${offer.offerId}:`, await offerUpdateResponse.text())
                }
              }
            }
          }
        }

        results.succeeded++
        results.updates.push({ 
          sku: item.sku, 
          quantity: item.quantity,
          price: item.price 
        })

        console.log(`[ebay-update-inventory] Updated ${item.sku}: qty=${item.quantity}${item.price ? `, price=${item.price}` : ''}`)

        // Log the sync
        await supabase.from('ebay_sync_log').insert({
          store_key: storeKey,
          operation: 'update_inventory',
          sku: item.sku,
          success: true,
          before_state: { source: 'api_call' },
          after_state: { quantity: item.quantity, price: item.price },
          dry_run: false,
        })

      } catch (error) {
        console.error(`[ebay-update-inventory] Error for ${item.sku}:`, error)
        results.failed++
        results.errors.push({ sku: item.sku, error: error.message })

        // Log the error
        await supabase.from('ebay_sync_log').insert({
          store_key: storeKey,
          operation: 'update_inventory',
          sku: item.sku,
          success: false,
          error_message: error.message,
          dry_run: false,
        })
      }

      // Small delay between items to avoid rate limits
      if (items.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`[ebay-update-inventory] Complete: ${results.succeeded}/${results.processed} succeeded`)

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[ebay-update-inventory] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
