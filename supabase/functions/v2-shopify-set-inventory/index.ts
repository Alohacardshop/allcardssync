import { corsHeaders } from '../_shared/cors.ts'

interface SetInventoryArgs {
  item_id: string
  /** New quantity for 'set_exact' mode, or delta for 'adjust' mode */
  quantity: number
  /** 'adjust' (default) uses delta, 'set_exact' uses absolute set */
  mode?: 'adjust' | 'set_exact'
  /** For optimistic locking: reject if current Shopify level differs */
  expected_available?: number
}

interface InventoryLevelResponse {
  inventory_level: {
    inventory_item_id: number
    location_id: number
    available: number
    updated_at: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { item_id, quantity, mode = 'adjust', expected_available }: SetInventoryArgs = await req.json()

    if (typeof quantity !== 'number') {
      throw new Error('Invalid quantity - must be a number')
    }

    // For set_exact mode, quantity must be non-negative
    if (mode === 'set_exact' && quantity < 0) {
      throw new Error('Invalid quantity for set_exact - must be non-negative')
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
    const inventoryItemId = intakeItem.shopify_inventory_item_id

    // Step 1: Fetch current Shopify inventory level
    console.log(`Fetching current Shopify inventory for item ${intakeItem.sku} (inventory_item_id: ${inventoryItemId})`)
    
    const currentLevelResponse = await fetch(
      `https://${domain}/admin/api/2024-07/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!currentLevelResponse.ok) {
      const errorText = await currentLevelResponse.text()
      throw new Error(`Failed to fetch current Shopify inventory: ${currentLevelResponse.status} - ${errorText}`)
    }

    const currentLevelData = await currentLevelResponse.json()
    const currentLevel = currentLevelData.inventory_levels?.[0]
    const currentAvailable = currentLevel?.available ?? 0

    console.log(`Current Shopify inventory: ${currentAvailable} for ${intakeItem.sku}`)

    // Step 2: Optimistic locking check
    if (typeof expected_available === 'number' && expected_available !== currentAvailable) {
      console.log(`Concurrency conflict: expected ${expected_available}, found ${currentAvailable}`)
      return new Response(JSON.stringify({
        success: false,
        error: 'STALE_DATA',
        message: 'Inventory changed in Shopify, please refresh',
        current_available: currentAvailable,
        expected_available
      }), {
        status: 409, // Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 3: Calculate new quantity and perform update
    let newQuantity: number
    let apiEndpoint: string
    let apiBody: Record<string, unknown>

    if (mode === 'adjust') {
      // Delta-based adjustment
      const delta = quantity
      newQuantity = Math.max(0, currentAvailable + delta)
      
      // Use adjust API
      apiEndpoint = `https://${domain}/admin/api/2024-07/inventory_levels/adjust.json`
      apiBody = {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: delta
      }
      
      console.log(`Adjusting Shopify inventory by ${delta} (${currentAvailable} → ${newQuantity}) for ${intakeItem.sku}`)
    } else {
      // Absolute set
      newQuantity = quantity
      
      // Use set API
      apiEndpoint = `https://${domain}/admin/api/2024-07/inventory_levels/set.json`
      apiBody = {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: quantity
      }
      
      console.log(`Setting Shopify inventory to ${quantity} for ${intakeItem.sku}`)
    }

    // Prevent negative inventory
    if (mode === 'adjust' && (currentAvailable + quantity) < 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INSUFFICIENT_INVENTORY',
        message: `Cannot reduce inventory below 0. Current: ${currentAvailable}, Attempted delta: ${quantity}`,
        current_available: currentAvailable
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const inventoryResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiBody)
    })

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text()
      throw new Error(`Failed to update Shopify inventory level: ${inventoryResponse.status} - ${errorText}`)
    }

    const inventoryResult = await inventoryResponse.json()
    const updatedLevel = inventoryResult.inventory_level

    // Update last synced timestamp and cache the new known value
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

    // Also update local inventory levels cache
    await supabase
      .from('shopify_inventory_levels')
      .upsert({
        store_key: storeKey,
        inventory_item_id: inventoryItemId,
        location_gid: intakeItem.shopify_location_gid,
        available: updatedLevel?.available ?? newQuantity,
        shopify_updated_at: updatedLevel?.updated_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key,inventory_item_id,location_gid' })

    console.log(`Successfully ${mode === 'adjust' ? 'adjusted' : 'set'} Shopify inventory to ${updatedLevel?.available ?? newQuantity} for ${intakeItem.sku}`)

    return new Response(JSON.stringify({
      success: true,
      synced_to_shopify: true,
      mode,
      previous_available: currentAvailable,
      new_available: updatedLevel?.available ?? newQuantity,
      message: `Shopify inventory ${mode === 'adjust' ? 'adjusted' : 'set'} to ${updatedLevel?.available ?? newQuantity}`
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
