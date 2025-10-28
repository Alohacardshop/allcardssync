import { corsHeaders } from '../_shared/cors.ts'

interface RemoveGradedArgs {
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
    const args: RemoveGradedArgs = await req.json()
    const { item_id, itemId, sku, certNumber, quantity = 1 } = args
    
    // Use item_id or itemId (frontend sends itemId)
    const actualItemId = item_id || itemId

    console.log('Remove graded args received:', { actualItemId, sku, certNumber, quantity })

    if (!actualItemId && !sku && !certNumber) {
      throw new Error('Either item_id/itemId, sku, or certNumber must be provided')
    }

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get intake item data - prefer item_id, then cert, then sku
    let intakeItem = null
    let fetchError = null
    
    if (actualItemId) {
      console.log(`Looking up graded item by ID: ${actualItemId}`)
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('id', actualItemId)
        .single()
      intakeItem = data
      fetchError = error
    } else if (certNumber) {
      console.log(`Looking up graded item by cert: ${certNumber}`)
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('psa_cert', certNumber)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      intakeItem = data
      fetchError = error
    } else if (sku) {
      console.log(`Looking up graded item by SKU: ${sku}`)
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('sku', sku)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      intakeItem = data
      fetchError = error
    }
    
    if (fetchError || !intakeItem) {
      console.error('Fetch error:', fetchError)
      throw new Error(`Failed to fetch graded item: ${fetchError?.message || 'Item not found'}`)
    }
    
    console.log(`Found graded item: ${intakeItem.sku} (ID: ${intakeItem.id})`)

    // Check if item has Shopify product ID
    if (!intakeItem.shopify_product_id) {
      // Item not in Shopify, just mark as sold
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          quantity: 0,
          sold_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: 'shopify_remove_graded'
        })
        .eq('id', intakeItem.id)

      if (updateError) {
        console.error('Failed to update intake item:', updateError)
      }

      return new Response(JSON.stringify({
        ok: true,
        action: 'marked_sold',
        message: 'Graded item marked as sold (was not in Shopify)'
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

    // Delete the product entirely from Shopify (graded cards are 1:1 with products)
    console.log(`Deleting Shopify graded product ${intakeItem.shopify_product_id}`)
    
    const deleteResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${intakeItem.shopify_product_id}.json`, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    })

    // Treat 404 as success (product already deleted)
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text().catch(() => 'Unknown error')
      throw new Error(
        `Failed to delete Shopify graded product: ${deleteResponse.status} ${deleteResponse.statusText} - ${errorText}`
      )
    }

    if (deleteResponse.status === 404) {
      console.log(`Shopify graded product ${intakeItem.shopify_product_id} not found – treating as already deleted`)
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
        updated_by: 'shopify_remove_graded'
      })
      .eq('id', intakeItem.id)

    if (updateError) {
      console.error('Failed to update intake item after graded removal:', updateError)
    }

    return new Response(JSON.stringify({
      ok: true,
      action: 'deleted_and_sold',
      message: 'Graded product deleted from Shopify and marked as sold'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in v2-shopify-remove-graded:', error)
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
