import { corsHeaders } from '../_shared/cors.ts'

interface SetInventoryArgs {
  item_id: string
  quantity: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { item_id, quantity }: SetInventoryArgs = await req.json()

    if (typeof quantity !== 'number' || quantity < 0) {
      throw new Error('Invalid quantity - must be a non-negative number')
    }

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get intake item data
    const { data: intakeItem, error: fetchError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', item_id)
      .single()
    
    if (fetchError || !intakeItem) {
      throw new Error(`Failed to fetch intake item: ${fetchError?.message || 'Item not found'}`)
    }

    // Check if item has Shopify product ID and inventory item ID
    if (!intakeItem.shopify_product_id) {
      return new Response(JSON.stringify({
        success: true,
        synced_to_shopify: false,
        message: 'Item is not synced with Shopify - database updated only'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!intakeItem.shopify_inventory_item_id || !intakeItem.shopify_location_gid) {
      return new Response(JSON.stringify({
        success: true,
        synced_to_shopify: false,
        message: 'Item missing Shopify inventory or location data - database updated only'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get Shopify credentials from database
    const storeKey = intakeItem.store_key
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    // Load credentials from system_settings table
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', domainKey)
      .single()
    
    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', tokenKey)
      .single()
    
    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}. Looking for ${domainKey} and ${tokenKey} in system_settings`)
    }

    const locationId = intakeItem.shopify_location_gid.replace('gid://shopify/Location/', '')
    
    console.log(`Setting Shopify inventory to ${quantity} for item ${intakeItem.sku} (product ${intakeItem.shopify_product_id})`)

    const inventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: intakeItem.shopify_inventory_item_id,
        available: quantity
      })
    })

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text()
      throw new Error(`Failed to update Shopify inventory level: ${inventoryResponse.status} - ${errorText}`)
    }

    // Update last synced timestamp
    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        last_shopify_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: 'shopify_set_inventory'
      })
      .eq('id', item_id)

    if (updateError) {
      console.error('Failed to update intake item sync timestamp:', updateError)
    }

    console.log(`Successfully set Shopify inventory to ${quantity} for ${intakeItem.sku}`)

    return new Response(JSON.stringify({
      success: true,
      synced_to_shopify: true,
      quantity,
      message: `Shopify inventory updated to ${quantity}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in v2-shopify-set-inventory:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
