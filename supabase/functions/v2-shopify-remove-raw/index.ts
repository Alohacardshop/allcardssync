// Specialized function for removing raw cards from Shopify
// Raw cards may have multiple copies, so we handle quantity decrements
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { loadStore, fetchRetry } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  const startTime = Date.now()
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, 
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  try {
    const { storeKey, productId, sku, locationGid, itemId, quantity = 1 } = await req.json().catch(() => ({}))
    
    if (!storeKey) {
      return json(400, { error: 'storeKey is required' })
    }

    console.log(`📦 RAW REMOVAL: SKU ${sku}, qty ${quantity}, productId ${productId}`)
    
    // Load Shopify credentials
    const { domain, token } = await loadStore(supabase, storeKey)
    
    // Get location ID for inventory updates
    let locationId = locationGid ? locationGid.split('/').pop() : null
    
    // Find variant, current quantity, and inventory item ID
    let variantId: string | null = null
    let inventoryItemId: string | null = null
    let currentQuantity = 0
    
    console.log(`🔍 Finding raw variant by SKU: ${sku}`)
    
    const query = `
      query($q: String!) {
        productVariants(first: 1, query: $q) {
          edges {
            node {
              id
              product { 
                id 
                title
                status
              }
              inventoryItem {
                id
              }
            }
          }
        }
      }
    `
    
    const response = await fetchRetry(`https://${domain}/admin/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { q: `sku:${sku}` }
      })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to find variant: ${response.status}`)
    }
    
    const result = await response.json()
    if (!result.data?.productVariants?.edges?.[0]) {
      console.log(`⚠️ No raw variant found for SKU ${sku}`)
      
      // Update database - mark as removed since nothing to reduce
      if (itemId) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'raw_not_found',
            shopify_product_id: null,
            shopify_variant_id: null,
            shopify_sync_status: 'removed',
            last_shopify_removal_error: null
          })
          .eq('id', itemId)
      }
      
      return json(200, {
        ok: true,
        action: 'not_found',
        message: 'Raw variant not found in Shopify',
        diagnostics: { storeKey, domain, sku, ms: Date.now() - startTime }
      })
    }
    
    const variantNode = result.data.productVariants.edges[0].node
    variantId = variantNode.id.split('/').pop()
    inventoryItemId = variantNode.inventoryItem.id.split('/').pop()
    
    console.log(`✅ Found raw variant: ${variantNode.product.title}`)
    console.log(`📦 VariantId: ${variantId}, InventoryItemId: ${inventoryItemId}`)
    
    // Skip if locationGid is missing (can't update inventory without location)
    if (!locationGid) {
      console.log(`⚠️ Missing location GID for SKU ${sku}`)
      
      if (itemId) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'raw_missing_location',
            shopify_sync_status: 'removed',
            last_shopify_removal_error: 'Missing location GID for inventory update'
          })
          .eq('id', itemId)
      }
      
      return json(200, {
        ok: true,
        action: 'missing_location',
        message: 'Location GID missing - cannot update inventory',
        diagnostics: {
          storeKey,
          domain,
          sku,
          ms: Date.now() - startTime
        }
      })
    }
    
    // Get current inventory level at this location
    if (locationId) {
      const inventoryQuery = `
        query($inventoryItemId: ID!, $locationIds: [ID!]!) {
          inventoryItem(id: $inventoryItemId) {
            inventoryLevels(locationIds: $locationIds, first: 1) {
              edges {
                node {
                  available
                }
              }
            }
          }
        }
      `
      
      const inventoryResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: inventoryQuery,
          variables: { 
            inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
            locationIds: [`gid://shopify/Location/${locationId}`]
          }
        })
      })
      
      if (inventoryResponse.ok) {
        const inventoryResult = await inventoryResponse.json()
        const level = inventoryResult.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node
        if (level) {
          currentQuantity = level.available || 0
        }
      }
    }
    
    console.log(`📊 Current inventory: ${currentQuantity}, Removing: ${quantity}`)
    
    // Calculate new quantity (don't go below 0)
    const newQuantity = Math.max(0, currentQuantity - quantity)
    
    console.log(`📉 Setting inventory to: ${newQuantity} (keeping product info)`)
    
    // Update inventory level using REST API
    const inventoryUpdateResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: newQuantity
      })
    })
    
    if (!inventoryUpdateResponse.ok) {
      const errorText = await inventoryUpdateResponse.text().catch(() => 'Unknown error')
      throw new Error(`Failed to update inventory: ${inventoryUpdateResponse.status} ${inventoryUpdateResponse.statusText} - ${errorText}`)
    }
    
    console.log(`✅ Successfully reduced raw inventory to ${newQuantity} (product kept in Shopify)`)
    
    // Update database - mark as quantity reduced, keep product references
    if (itemId) {
      await supabase
        .from('intake_items')
        .update({
          shopify_removed_at: new Date().toISOString(),
          shopify_removal_mode: 'raw_quantity_reduced',
          // Keep shopify_product_id and shopify_variant_id since product still exists
          shopify_sync_status: 'removed',
          last_shopify_removal_error: null
        })
        .eq('id', itemId)
    }
    
    return json(200, {
      ok: true,
      action: 'quantity_reduced',
      message: `Raw inventory reduced by ${quantity} (product kept in Shopify)`,
      diagnostics: {
        storeKey,
        domain,
        sku,
        variantId,
        inventoryItemId,
        previousQuantity: currentQuantity,
        newQuantity,
        reducedBy: quantity,
        ms: Date.now() - startTime
      }
    })
    
  } catch (error: any) {
    console.error('🚨 Raw removal error:', error)
    
    // Update database with error
    const { itemId } = await req.json().catch(() => ({}))
    if (itemId) {
      await supabase
        .from('intake_items')
        .update({
          last_shopify_removal_error: error.message,
          shopify_sync_status: 'error'
        })
        .eq('id', itemId)
    }
    
    return json(500, {
      ok: false,
      error: error.message || 'Internal error',
      diagnostics: { ms: Date.now() - startTime }
    })
  }
})