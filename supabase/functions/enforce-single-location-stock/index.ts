import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnforceLocationRequest {
  sku: string
  desired_location_id: string | null // null means set all to 0
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
    const body: EnforceLocationRequest = await req.json()
    const { sku, desired_location_id, store_key } = body

    if (!sku || !store_key) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: sku, store_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[enforce-single-location] Enforcing location for SKU=${sku}, location=${desired_location_id}, store=${store_key}`)

    // Step 1: Fetch card details
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('id, sku, shopify_inventory_item_id, current_shopify_location_id')
      .eq('sku', sku)
      .single()

    if (cardError || !card) {
      console.error('[enforce-single-location] Card not found:', cardError)
      return new Response(
        JSON.stringify({ error: 'Card not found', sku }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!card.shopify_inventory_item_id) {
      console.warn('[enforce-single-location] Card has no Shopify inventory item ID:', sku)
      return new Response(
        JSON.stringify({ error: 'Card not linked to Shopify', sku }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Get Shopify credentials
    const storeKeyUpper = store_key.toUpperCase().replace(/_STORE$/i, '')
    
    const { data: credentials } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', [`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`, `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`])

    const credMap = new Map(credentials?.map(c => [c.key_name, c.key_value]) || [])
    const domain = credMap.get(`SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
    const token = credMap.get(`SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)

    if (!domain || !token) {
      console.error('[enforce-single-location] No Shopify credentials for store:', store_key)
      return new Response(
        JSON.stringify({ error: 'Shopify credentials not found', store_key }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 3: Fetch all locations for this store
    const locationsResponse = await fetch(
      `https://${domain}/admin/api/2024-07/locations.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!locationsResponse.ok) {
      const errorText = await locationsResponse.text()
      console.error('[enforce-single-location] Failed to fetch locations:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Shopify locations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const locationsData = await locationsResponse.json()
    const locations: { id: string; name: string }[] = locationsData.locations || []

    console.log(`[enforce-single-location] Found ${locations.length} locations for store ${store_key}`)

    // Step 4: Set inventory at each location
    const results: { location_id: string; location_name: string; quantity: number; success: boolean; error?: string }[] = []
    const desiredLocationNumericId = desired_location_id?.replace('gid://shopify/Location/', '')

    for (const location of locations) {
      const locationId = location.id.toString()
      const targetQuantity = (desired_location_id && locationId === desiredLocationNumericId) ? 1 : 0

      try {
        const inventoryResponse = await fetch(
          `https://${domain}/admin/api/2024-07/inventory_levels/set.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              location_id: locationId,
              inventory_item_id: card.shopify_inventory_item_id,
              available: targetQuantity
            })
          }
        )

        if (inventoryResponse.ok) {
          console.log(`[enforce-single-location] ✓ Set ${sku} at location ${location.name} to ${targetQuantity}`)
          results.push({
            location_id: locationId,
            location_name: location.name,
            quantity: targetQuantity,
            success: true
          })
        } else {
          const errorText = await inventoryResponse.text()
          console.error(`[enforce-single-location] Failed at location ${location.name}:`, errorText)
          results.push({
            location_id: locationId,
            location_name: location.name,
            quantity: targetQuantity,
            success: false,
            error: errorText
          })
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (locError: any) {
        console.error(`[enforce-single-location] Error at location ${location.name}:`, locError)
        results.push({
          location_id: locationId,
          location_name: location.name,
          quantity: targetQuantity,
          success: false,
          error: locError.message
        })
      }
    }

    // Step 5: Update card's current location in database
    if (desired_location_id) {
      await supabase
        .from('cards')
        .update({
          current_shopify_location_id: desired_location_id,
          updated_at: new Date().toISOString()
        })
        .eq('sku', sku)
    }

    const allSuccess = results.every(r => r.success)
    const successCount = results.filter(r => r.success).length

    console.log(`[enforce-single-location] Completed: ${successCount}/${results.length} locations updated`)

    return new Response(
      JSON.stringify({
        success: allSuccess,
        sku,
        desired_location_id,
        locations_updated: successCount,
        locations_total: results.length,
        results
      }),
      { status: allSuccess ? 200 : 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[enforce-single-location] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
