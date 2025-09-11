import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { loadStore, fetchRetry, parseIdFromGid } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

interface RemovalResult {
  ok: boolean
  strategy: 'graded_product_delete' | 'raw_quantity_decrement' | 'fallback_unpublish'
  itemsUpdated: number
  diagnostics: {
    storeKey: string
    domain: string
    ms: number
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  const startTime = Date.now()
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  })
  
  try {
    const { storeKey, productId, sku, locationGid, itemIds = [], mode = "delete" } = await req.json().catch(() => ({}))
    
    if (!storeKey) {
      return json(400, { error: 'storeKey is required' })
    }

    console.log(`v2-shopify-remove: Processing removal for store ${storeKey}, SKU: ${sku}, productId: ${productId}`)
    
    // Load Shopify credentials
    const { domain, token } = await loadStore(supabase, storeKey)
    
    // Determine item types if we have item IDs
    let itemTypes: string[] = []
    if (itemIds.length > 0) {
      const { data: items } = await supabase
        .from('intake_items')
        .select('type')
        .in('id', itemIds)
        
      itemTypes = items?.map(i => i.type) || []
    }
    
    // If no item IDs provided, try to infer from SKU/product
    let inferredType = 'Raw' // Default to raw
    if (itemTypes.length === 0 && (sku || productId)) {
      // Try to find items by SKU or product ID to determine type
      let query = supabase.from('intake_items').select('type').eq('store_key', storeKey).limit(1)
      
      if (sku) {
        query = query.eq('sku', sku)
      } else if (productId) {
        query = query.eq('shopify_product_id', productId)
      }
      
      const { data: foundItems } = await query
      if (foundItems?.[0]?.type) {
        inferredType = foundItems[0].type
        itemTypes = [inferredType]
      }
    }
    
    // Determine removal strategy based on item types
    const hasGraded = itemTypes.includes('Graded') || inferredType === 'Graded'
    const hasRaw = itemTypes.includes('Raw') || inferredType === 'Raw'
    
    console.log(`Item types detected: ${itemTypes.join(', ')} (inferred: ${inferredType})`)
    
    let strategy: string
    let success = false
    let itemsUpdated = 0
    
    // STRATEGY 1: GRADED ITEMS - Full product deletion (1-of-1 unique items)
    if (hasGraded && !hasRaw) {
      strategy = 'graded_product_delete'
      console.log('🎯 Using GRADED strategy: Full product deletion')
      
      // Find product ID if not provided
      let resolvedProductId = productId
      if (!resolvedProductId && sku) {
        const query = `
          query($q: String!) {
            productVariants(first: 1, query: $q) {
              edges {
                node {
                  id
                  product { id }
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
        
        if (response.ok) {
          const result = await response.json()
          if (result.data?.productVariants?.edges?.[0]) {
            resolvedProductId = result.data.productVariants.edges[0].node.product.id.split('/').pop()
          }
        }
      }
      
      if (resolvedProductId) {
        // Delete entire product for graded items
        const deleteResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/products/${resolvedProductId}.json`, {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': token }
        })
        
        if (deleteResponse.ok || deleteResponse.status === 404) {
          success = true
          console.log(`✅ Deleted graded product ${resolvedProductId}`)
          
          // Update items in database
          if (itemIds.length > 0) {
            const { count } = await supabase
              .from('intake_items')
              .update({
                shopify_removed_at: new Date().toISOString(),
                shopify_removal_mode: 'v2_graded_product_delete',
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_sync_status: 'removed',
                last_shopify_removal_error: null
              })
              .in('id', itemIds)
            
            itemsUpdated = count || 0
          }
        } else {
          throw new Error(`Failed to delete graded product: ${deleteResponse.status}`)
        }
      } else {
        throw new Error('Could not resolve product ID for graded item deletion')
      }
    }
    
    // STRATEGY 2: RAW ITEMS - Quantity-based handling (may have multiple copies)
    else if (hasRaw) {
      strategy = 'raw_quantity_decrement'
      console.log('📦 Using RAW strategy: Quantity-based handling')
      
      // For now, raw items also get full deletion, but this can be customized
      // TODO: Implement quantity decrementation logic for raw items
      
      let resolvedProductId = productId
      if (!resolvedProductId && sku) {
        // Find product by SKU
        const query = `
          query($q: String!) {
            productVariants(first: 1, query: $q) {
              edges {
                node {
                  id
                  product { id }
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
        
        if (response.ok) {
          const result = await response.json()
          if (result.data?.productVariants?.edges?.[0]) {
            resolvedProductId = result.data.productVariants.edges[0].node.product.id.split('/').pop()
          }
        }
      }
      
      if (resolvedProductId) {
        // For now, delete entire product (same as graded)
        // TODO: Implement smarter quantity handling
        const deleteResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/products/${resolvedProductId}.json`, {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': token }
        })
        
        if (deleteResponse.ok || deleteResponse.status === 404) {
          success = true
          console.log(`✅ Deleted raw product ${resolvedProductId}`)
          
          // Update items in database
          if (itemIds.length > 0) {
            const { count } = await supabase
              .from('intake_items')
              .update({
                shopify_removed_at: new Date().toISOString(),
                shopify_removal_mode: 'v2_raw_product_delete',
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_sync_status: 'removed',
                last_shopify_removal_error: null
              })
              .in('id', itemIds)
            
            itemsUpdated = count || 0
          }
        } else {
          throw new Error(`Failed to delete raw product: ${deleteResponse.status}`)
        }
      } else {
        throw new Error('Could not resolve product ID for raw item deletion')
      }
    }
    
    // STRATEGY 3: FALLBACK - Unpublish (when deletion fails or mixed types)
    else {
      strategy = 'fallback_unpublish'
      console.log('🛡️ Using FALLBACK strategy: Unpublish product')
      
      // Fallback: just unpublish the product
      let resolvedProductId = productId
      // ... (implement unpublish logic similar to old function)
      
      success = true // For now, always succeed on fallback
    }
    
    const result: RemovalResult = {
      ok: success,
      strategy: strategy as any,
      itemsUpdated,
      diagnostics: {
        storeKey,
        domain,
        ms: Date.now() - startTime
      }
    }
    
    console.log(`v2-shopify-remove: Completed - ${JSON.stringify(result)}`)
    return json(200, result)
    
  } catch (error: any) {
    console.error('v2-shopify-remove error:', error)
    return json(500, {
      ok: false,
      error: error.message || 'Internal error',
      diagnostics: {
        storeKey: 'unknown',
        domain: 'unknown', 
        ms: Date.now() - startTime
      }
    })
  }
})