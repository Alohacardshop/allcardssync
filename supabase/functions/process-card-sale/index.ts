import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessSaleRequest {
  sku: string
  source: 'shopify' | 'ebay'
  source_event_id: string
  store_key?: string
}

interface AtomicSaleResult {
  result: 'sold' | 'already_sold' | 'duplicate_event' | 'not_found'
  card_id?: string
  sku?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const body: ProcessSaleRequest = await req.json()
    const { sku, source, source_event_id, store_key } = body

    if (!sku || !source || !source_event_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: sku, source, source_event_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[process-card-sale] Processing sale: SKU=${sku}, source=${source}, event=${source_event_id}`)

    // Step 1: Call atomic_mark_card_sold RPC
    const { data: saleResult, error: saleError } = await supabase.rpc('atomic_mark_card_sold', {
      p_sku: sku,
      p_source: source,
      p_source_event_id: source_event_id
    })

    if (saleError) {
      console.error('[process-card-sale] Atomic lock error:', saleError)
      return new Response(
        JSON.stringify({ error: 'Failed to process sale lock', details: saleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result: AtomicSaleResult = Array.isArray(saleResult) ? saleResult[0] : saleResult
    console.log(`[process-card-sale] Atomic lock result:`, result)

    // Handle non-sold results (idempotent success)
    if (result.result === 'duplicate_event') {
      console.log(`[process-card-sale] Duplicate event, already processed: ${source_event_id}`)
      return new Response(
        JSON.stringify({ success: true, status: 'duplicate_event', message: 'Event already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (result.result === 'already_sold') {
      console.log(`[process-card-sale] Card already sold: ${sku}`)
      return new Response(
        JSON.stringify({ success: true, status: 'already_sold', message: 'Card already sold' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (result.result === 'not_found') {
      console.warn(`[process-card-sale] Card not found in cards table: ${sku}`)
      return new Response(
        JSON.stringify({ success: true, status: 'not_found', message: 'Card not tracked in cards table' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Card was just sold - fetch full card details
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('id, sku, ebay_offer_id, shopify_inventory_item_id, shopify_variant_id, current_shopify_location_id')
      .eq('sku', sku)
      .single()

    if (cardError || !card) {
      console.error('[process-card-sale] Failed to fetch card details:', cardError)
      return new Response(
        JSON.stringify({ success: true, status: 'sold', warning: 'Card sold but details unavailable' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const crossChannelResults: { action: string; success: boolean; error?: string }[] = []

    // Step 3: Cross-channel sync based on sale source
    if (source === 'ebay') {
      // eBay sale -> Need to zero Shopify inventory
      if (card.shopify_inventory_item_id && card.current_shopify_location_id) {
        console.log(`[process-card-sale] eBay sale - zeroing Shopify inventory for ${sku}`)
        
        try {
          // Get Shopify credentials
          const resolvedStoreKey = store_key || 'hawaii' // Default store
          const storeKeyUpper = resolvedStoreKey.toUpperCase().replace(/_STORE$/i, '')
          
          const { data: credentials } = await supabase
            .from('system_settings')
            .select('key_name, key_value')
            .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`])

          const credMap = new Map(credentials?.map(c => [c.key_name, c.key_value]) || [])
          const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
          const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)

          if (domain && token) {
            const requestId = generateRequestId('sale-zero')
            const locationId = locationGidToId(card.current_shopify_location_id)
            
            const inventoryResult = await writeInventory({
              domain,
              token,
              inventory_item_id: card.shopify_inventory_item_id,
              location_id: locationId,
              action: 'cross_channel_zero',
              quantity: 0,
              request_id: requestId,
              store_key: resolvedStoreKey,
              sku,
              source_function: 'process-card-sale',
              triggered_by: 'system',
              supabase
            })

            if (inventoryResult.success) {
              console.log(`[process-card-sale] ✓ Shopify inventory zeroed for ${sku}`)
              crossChannelResults.push({ action: 'zero_shopify', success: true })
            } else {
              console.error(`[process-card-sale] Failed to zero Shopify: ${inventoryResult.error}`)
              
              // Queue for retry
              await supabase.rpc('queue_shopify_zero', {
                p_sku: sku,
                p_inventory_item_id: card.shopify_inventory_item_id,
                p_location_id: card.current_shopify_location_id,
                p_store_key: resolvedStoreKey
              })
              
              crossChannelResults.push({ action: 'zero_shopify', success: false, error: 'Queued for retry' })
            }
          } else {
            console.warn(`[process-card-sale] No Shopify credentials for store: ${resolvedStoreKey}`)
            crossChannelResults.push({ action: 'zero_shopify', success: false, error: 'No credentials' })
          }
        } catch (shopifyError: any) {
          console.error('[process-card-sale] Shopify sync error:', shopifyError)
          
          // Queue for retry
          await supabase.rpc('queue_shopify_zero', {
            p_sku: sku,
            p_inventory_item_id: card.shopify_inventory_item_id,
            p_location_id: card.current_shopify_location_id,
            p_store_key: store_key || 'hawaii'
          })
          
          crossChannelResults.push({ action: 'zero_shopify', success: false, error: shopifyError.message })
        }
      }
    } else if (source === 'shopify') {
      // Shopify sale -> Need to end eBay listing
      if (card.ebay_offer_id) {
        console.log(`[process-card-sale] Shopify sale - ending eBay listing for ${sku}`)
        
        try {
          // Call ebay-update-inventory to set quantity to 0
          const ebayResponse = await fetch(
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
                store_key: store_key || 'hawaii'
              })
            }
          )

          if (ebayResponse.ok) {
            console.log(`[process-card-sale] ✓ eBay listing ended for ${sku}`)
            crossChannelResults.push({ action: 'end_ebay', success: true })
          } else {
            const errorText = await ebayResponse.text()
            console.error(`[process-card-sale] Failed to end eBay listing: ${errorText}`)
            
            // Queue for retry
            await supabase.rpc('queue_ebay_end_listing', {
              p_sku: sku,
              p_ebay_offer_id: card.ebay_offer_id
            })
            
            crossChannelResults.push({ action: 'end_ebay', success: false, error: 'Queued for retry' })
          }
        } catch (ebayError: any) {
          console.error('[process-card-sale] eBay sync error:', ebayError)
          
          // Queue for retry
          await supabase.rpc('queue_ebay_end_listing', {
            p_sku: sku,
            p_ebay_offer_id: card.ebay_offer_id
          })
          
          crossChannelResults.push({ action: 'end_ebay', success: false, error: ebayError.message })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: 'sold',
        sku,
        source,
        card_id: card.id,
        cross_channel_sync: crossChannelResults
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[process-card-sale] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
