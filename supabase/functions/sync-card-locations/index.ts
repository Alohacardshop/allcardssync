import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Card {
  id: string
  sku: string
  shopify_inventory_item_id: string
  current_shopify_location_id: string | null
  status: string
}

interface InventoryLevel {
  location_id: string
  available: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Parse optional parameters
    let storeKey = 'hawaii'
    let limit = 100
    
    try {
      const body = await req.json()
      storeKey = body.store_key || storeKey
      limit = body.limit || limit
    } catch {
      // No body provided, use defaults
    }

    console.log(`[sync-card-locations] Starting location sync for store: ${storeKey}`)

    // Step 1: Get Shopify credentials
    const storeKeyUpper = storeKey.toUpperCase().replace(/_STORE$/i, '')
    
    const { data: credentials } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`])

    const credMap = new Map(credentials?.map(c => [c.key_name, c.key_value]) || [])
    const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
    const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)

    if (!domain || !token) {
      console.error('[sync-card-locations] No Shopify credentials for store:', storeKey)
      return new Response(
        JSON.stringify({ error: 'Shopify credentials not found', store_key: storeKey }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Fetch available cards with Shopify inventory item IDs
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, sku, shopify_inventory_item_id, current_shopify_location_id, status')
      .eq('status', 'available')
      .not('shopify_inventory_item_id', 'is', null)
      .limit(limit)

    if (cardsError) {
      console.error('[sync-card-locations] Failed to fetch cards:', cardsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch cards', details: cardsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!cards || cards.length === 0) {
      console.log('[sync-card-locations] No available cards to sync')
      return new Response(
        JSON.stringify({ success: true, synced: 0, drifts: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[sync-card-locations] Processing ${cards.length} cards`)

    const results = {
      synced: 0,
      unchanged: 0,
      drifts_created: 0,
      errors: 0
    }

    // Step 3: Process each card
    for (const card of cards as Card[]) {
      try {
        // Fetch inventory levels from Shopify
        const inventoryResponse = await fetch(
          `https://${domain}/admin/api/2024-07/inventory_levels.json?inventory_item_ids=${card.shopify_inventory_item_id}`,
          {
            headers: {
              'X-Shopify-Access-Token': token,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!inventoryResponse.ok) {
          console.error(`[sync-card-locations] Failed to fetch inventory for SKU ${card.sku}`)
          results.errors++
          continue
        }

        const inventoryData = await inventoryResponse.json()
        const levels: InventoryLevel[] = (inventoryData.inventory_levels || []).map((l: any) => ({
          location_id: l.location_id?.toString(),
          available: l.available || 0
        }))

        // Find locations with qty > 0
        const positiveLocations = levels.filter(l => l.available > 0)

        if (positiveLocations.length === 1) {
          // Exactly one location has stock - this is correct
          const actualLocationGid = `gid://shopify/Location/${positiveLocations[0].location_id}`
          
          if (card.current_shopify_location_id !== actualLocationGid) {
            // Update card location
            await supabase
              .from('cards')
              .update({
                current_shopify_location_id: actualLocationGid,
                updated_at: new Date().toISOString()
              })
              .eq('id', card.id)
            
            console.log(`[sync-card-locations] Updated location for ${card.sku}: ${card.current_shopify_location_id} -> ${actualLocationGid}`)
            results.synced++
          } else {
            results.unchanged++
          }
        } else if (positiveLocations.length > 1) {
          // DRIFT: Multiple locations have stock - this violates the invariant!
          console.warn(`[sync-card-locations] DRIFT: SKU ${card.sku} has stock at ${positiveLocations.length} locations`)
          
          await supabase.rpc('flag_location_drift', {
            p_sku: card.sku,
            p_card_id: card.id,
            p_drift_type: 'multi_location',
            p_expected_location: card.current_shopify_location_id,
            p_actual_locations: positiveLocations.map(l => ({
              location_id: l.location_id,
              location_gid: `gid://shopify/Location/${l.location_id}`,
              quantity: l.available
            }))
          })
          
          results.drifts_created++
        } else if (positiveLocations.length === 0) {
          // DRIFT: No location has stock but card is marked available
          console.warn(`[sync-card-locations] DRIFT: SKU ${card.sku} has no stock anywhere but status=available`)
          
          await supabase.rpc('flag_location_drift', {
            p_sku: card.sku,
            p_card_id: card.id,
            p_drift_type: 'no_location',
            p_expected_location: card.current_shopify_location_id,
            p_actual_locations: levels.map(l => ({
              location_id: l.location_id,
              location_gid: `gid://shopify/Location/${l.location_id}`,
              quantity: l.available
            }))
          })
          
          results.drifts_created++
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (cardError: any) {
        console.error(`[sync-card-locations] Error processing card ${card.sku}:`, cardError)
        results.errors++
      }
    }

    console.log(`[sync-card-locations] Completed: synced=${results.synced}, unchanged=${results.unchanged}, drifts=${results.drifts_created}, errors=${results.errors}`)

    return new Response(
      JSON.stringify({
        success: true,
        store_key: storeKey,
        cards_processed: cards.length,
        ...results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[sync-card-locations] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
