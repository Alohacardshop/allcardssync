import { corsHeaders } from '../_shared/cors.ts'

interface RemoveRawArgs {
  item_id?: string
  itemId?: string  // Alternative name from frontend
  sku?: string
  certNumber?: string
  quantity?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const args: RemoveRawArgs = await req.json()
    const { item_id, itemId, sku, certNumber, quantity = 1 } = args
    
    // Use item_id or itemId (frontend sends itemId)
    const actualItemId = item_id || itemId

    console.log('Remove raw args received:', { actualItemId, sku, quantity })

    if (!actualItemId && !sku) {
      throw new Error('Either item_id/itemId or sku must be provided')
    }

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get intake item data - prefer item_id over sku for uniqueness
    let intakeItem = null
    let fetchError = null
    
    if (actualItemId) {
      console.log(`Looking up item by ID: ${actualItemId}`)
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('id', actualItemId)
        .single()
      intakeItem = data
      fetchError = error
    } else if (sku) {
      console.log(`Looking up item by SKU: ${sku}`)
      // For SKU, get the most recent non-deleted item
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('sku', sku)
        .is('deleted_at', null)
        .gt('quantity', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      intakeItem = data
      fetchError = error
    }
    
    if (fetchError || !intakeItem) {
      console.error('Fetch error:', fetchError)
      throw new Error(`Failed to fetch intake item: ${fetchError?.message || 'Item not found'}`)
    }
    
    console.log(`Found item: ${intakeItem.sku} (ID: ${intakeItem.id}), quantity: ${intakeItem.quantity}`)

    // For raw cards, use the reduce function instead of complete removal
    const currentQuantity = intakeItem.quantity || 1
    
    if (currentQuantity > quantity) {
      // Reduce quantity instead of complete removal
      console.log(`Raw card ${intakeItem.sku}: Reducing quantity by ${quantity} (current: ${currentQuantity})`)
      
      // Call the reduce function
      const reduceResponse = await fetch(`${supabaseUrl}/functions/v1/v2-shopify-reduce-raw`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: intakeItem.id,
          reduce_quantity: quantity
        })
      })

      if (!reduceResponse.ok) {
        const errorText = await reduceResponse.text()
        throw new Error(`Failed to reduce raw card quantity: ${errorText}`)
      }

      const result = await reduceResponse.json()
      return new Response(JSON.stringify({
        ok: true,
        action: 'quantity_reduced',
        ...result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // If quantity will be 0 or less, proceed with complete removal
    console.log(`Raw card ${intakeItem.sku}: Removing completely (quantity: ${currentQuantity}, removing: ${quantity})`)

    // Check if item has Shopify product ID
    if (!intakeItem.shopify_product_id) {
      // Item not in Shopify, just mark as removed
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          quantity: 0,
          sold_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: 'shopify_remove_raw'
        })
        .eq('id', intakeItem.id)

      if (updateError) {
        console.error('Failed to update intake item:', updateError)
      }

      return new Response(JSON.stringify({
        ok: true,
        action: 'marked_sold',
        message: 'Item marked as sold (was not in Shopify)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get Shopify credentials
    const storeKey = intakeItem.store_key
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Delete the product entirely from Shopify
    console.log(`Deleting Shopify product ${intakeItem.shopify_product_id}`)
    
    const deleteResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${intakeItem.shopify_product_id}.json`, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    })

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      throw new Error(`Failed to delete Shopify product: ${errorText}`)
    }

    // Update intake item to mark as sold and removed from Shopify
    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        quantity: 0,
        sold_at: new Date().toISOString(),
        shopify_product_id: null,
        shopify_variant_id: null,
        shopify_inventory_item_id: null,
        shopify_sync_status: 'removed',
        shopify_removed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: 'shopify_remove_raw'
      })
      .eq('id', intakeItem.id)

    if (updateError) {
      console.error('Failed to update intake item after removal:', updateError)
    }

    return new Response(JSON.stringify({
      ok: true,
      action: 'deleted_and_sold',
      message: 'Product deleted from Shopify and marked as sold'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in v2-shopify-remove-raw:', error)
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})