import { corsHeaders } from '../_shared/cors.ts'

interface ReduceRawArgs {
  item_id: string
  reduce_quantity?: number // How many to reduce (defaults to 1)
  force_db_cleanup?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { item_id, reduce_quantity = 1, force_db_cleanup = false }: ReduceRawArgs = await req.json()

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

    // Check if item has Shopify product ID
    if (!intakeItem.shopify_product_id) {
      throw new Error('Item is not synced with Shopify')
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

    const currentQuantity = intakeItem.quantity || 1
    const newQuantity = currentQuantity - reduce_quantity

    console.log(`Raw card ${intakeItem.sku}: Current quantity ${currentQuantity}, reducing by ${reduce_quantity}, new quantity: ${newQuantity}`)

    if (newQuantity <= 0) {
      // Delete the product entirely from Shopify
      console.log(`Deleting Shopify product ${intakeItem.shopify_product_id}`)
      
      let shopifyAttempted = true
      let shopifyOkOrGone = false
      
      const deleteResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${intakeItem.shopify_product_id}.json`, {
        method: 'DELETE',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      })

      // Treat 404 as success (product already deleted)
      if (deleteResponse.ok || deleteResponse.status === 404) {
        shopifyOkOrGone = true
        if (deleteResponse.status === 404) {
          console.log(`Shopify product ${intakeItem.shopify_product_id} not found – treating as already deleted (reduce-raw)`)
        }
      } else if (!force_db_cleanup) {
        // Only throw if not forcing DB cleanup
        const errorText = await deleteResponse.text().catch(() => 'Unknown error')
        throw new Error(
          `Failed to delete Shopify product: ${deleteResponse.status} ${deleteResponse.statusText} - ${errorText}`
        )
      } else {
        console.warn(`Shopify deletion failed but force_db_cleanup=true, proceeding with DB update: ${deleteResponse.status} ${deleteResponse.statusText}`)
      }

      // Update intake item to mark as removed from Shopify
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          shopify_product_id: null,
          shopify_variant_id: null,
          shopify_inventory_item_id: null,
          shopify_sync_status: 'removed',
          shopify_removed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: 'shopify_reduce_raw'
        })
        .eq('id', item_id)

      if (updateError) {
        console.error('Failed to update intake item after deletion:', updateError)
      }

      return new Response(JSON.stringify({
        success: true,
        shopifyAttempted,
        shopifyOkOrGone,
        action: 'deleted',
        message: 'Product deleted from Shopify'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else {
      // Reduce quantity by updating inventory level
      console.log(`Updating Shopify inventory to ${newQuantity} for product ${intakeItem.shopify_product_id}`)
      
      const locationId = intakeItem.shopify_location_gid.replace('gid://shopify/Location/', '')
      
      const inventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: intakeItem.shopify_inventory_item_id,
          available: newQuantity
        })
      })

      if (!inventoryResponse.ok) {
        const errorText = await inventoryResponse.text()
        throw new Error(`Failed to update inventory level: ${errorText}`)
      }

      // Update intake item quantity in database
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          quantity: newQuantity,
          last_shopify_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: 'shopify_reduce_raw'
        })
        .eq('id', item_id)

      if (updateError) {
        console.error('Failed to update intake item quantity:', updateError)
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'quantity_reduced',
        old_quantity: currentQuantity,
        new_quantity: newQuantity,
        message: `Quantity reduced from ${currentQuantity} to ${newQuantity}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Error in v2-shopify-reduce-raw:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})