import { corsHeaders } from '../_shared/cors.ts'
import { 
  loadStore, 
  updateInventorySmart, 
  type InventoryOperationType,
  type SmartInventoryResult 
} from '../_shared/shopify-helpers.ts'

interface SetInventoryArgs {
  item_id: string
  /** Quantity: delta for adjust operations, target (0/1) for graded enforcement */
  quantity: number
  /** Operation type determines API selection automatically */
  operation?: InventoryOperationType
  /** @deprecated Use 'operation' instead. 'adjust' maps to 'manual_adjust', 'set_exact' maps to 'enforce_graded' */
  mode?: 'adjust' | 'set_exact'
  /** For optimistic locking: reject if current Shopify level differs */
  expected_available?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body: SetInventoryArgs = await req.json()
    let { item_id, quantity, operation, mode, expected_available } = body

    if (typeof quantity !== 'number') {
      throw new Error('Invalid quantity - must be a number')
    }

    // Map deprecated mode to operation type
    if (!operation && mode) {
      operation = mode === 'set_exact' ? 'enforce_graded' : 'manual_adjust'
    }
    operation = operation || 'manual_adjust'

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

    // Determine if this is a graded 1-of-1 item
    const isGraded = intakeItem.grading_company && intakeItem.grading_company !== 'RAW'

    // Validate: enforce_graded only for graded items with valid quantities
    if (operation === 'enforce_graded') {
      if (!isGraded) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_OPERATION',
          message: 'enforce_graded operation is only valid for graded 1-of-1 items'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (quantity !== 0 && quantity !== 1) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_QUANTITY',
          message: 'enforce_graded operation requires quantity of 0 or 1'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Load Shopify credentials
    const storeKey = intakeItem.store_key
    const { domain, token } = await loadStore(supabase, storeKey)

    const locationId = intakeItem.shopify_location_gid.replace('gid://shopify/Location/', '')
    const inventoryItemId = intakeItem.shopify_inventory_item_id

    console.log(`Updating Shopify inventory for ${intakeItem.sku}: operation=${operation}, quantity=${quantity}, isGraded=${isGraded}`)

    // Use smart inventory update that auto-selects API
    const result: SmartInventoryResult = await updateInventorySmart({
      domain,
      token,
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      operation,
      quantity,
      expected_available,
      is_graded: isGraded
    })

    if (!result.success) {
      // Handle specific error types
      if (result.stale) {
        return new Response(JSON.stringify({
          success: false,
          error: 'STALE_DATA',
          message: 'Inventory changed in Shopify, please refresh',
          current_available: result.previous_available,
          expected_available
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (result.error?.includes('INSUFFICIENT_INVENTORY')) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INSUFFICIENT_INVENTORY',
          message: result.error,
          current_available: result.previous_available
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      throw new Error(result.error || 'Unknown inventory update error')
    }

    // Update last synced timestamp
    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        last_shopify_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: `shopify_${operation}`
      })
      .eq('id', item_id)

    if (updateError) {
      console.error('Failed to update intake item sync timestamp:', updateError)
    }

    // Update local inventory levels cache
    await supabase
      .from('shopify_inventory_levels')
      .upsert({
        store_key: storeKey,
        inventory_item_id: inventoryItemId,
        location_gid: intakeItem.shopify_location_gid,
        available: result.new_available ?? 0,
        shopify_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key,inventory_item_id,location_gid' })

    console.log(`Successfully updated Shopify inventory: ${result.api_used} API, ${result.previous_available} → ${result.new_available}`)

    return new Response(JSON.stringify({
      success: true,
      synced_to_shopify: true,
      operation,
      api_used: result.api_used,
      previous_available: result.previous_available,
      new_available: result.new_available,
      message: `Shopify inventory updated via ${result.api_used} API`
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
})
