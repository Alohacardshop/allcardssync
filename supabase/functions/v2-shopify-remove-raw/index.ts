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
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  })
  
  try {
    const { storeKey, productId, sku, locationGid, itemId, quantity = 1 } = await req.json().catch(() => ({}))
    
    if (!storeKey) {
      return json(400, { error: 'storeKey is required' })
    }

    console.log(`📦 RAW REMOVAL: SKU ${sku}, qty ${quantity}, productId ${productId}`)
    
    // Load Shopify credentials
    const { domain, token } = await loadStore(supabase, storeKey)
    
    // TODO: Implement intelligent raw card handling
    // For now, we'll delete the entire product (same as graded)
    // In the future, this should:
    // 1. Check current inventory quantity
    // 2. Decrement by the item quantity
    // 3. Only delete product if quantity reaches 0
    
    console.log(`⚠️ RAW CARD REMOVAL - Currently using full deletion`)
    console.log(`🔄 TODO: Implement quantity decrement logic`)
    
    let resolvedProductId = productId
    
    // Find product by SKU if not provided
    if (!resolvedProductId && sku) {
      console.log(`🔍 Finding raw product by SKU: ${sku}`)
      
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
                inventoryQuantity
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
          const variantNode = result.data.productVariants.edges[0].node
          resolvedProductId = variantNode.product.id.split('/').pop()
          console.log(`✅ Found raw product: ${variantNode.product.title} (qty: ${variantNode.inventoryQuantity})`)
        }
      }
    }
    
    if (!resolvedProductId) {
      console.log(`⚠️ No raw product found for SKU ${sku}`)
      
      // Update database - mark as removed
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
        message: 'Raw product not found in Shopify',
        diagnostics: { storeKey, domain, sku, ms: Date.now() - startTime }
      })
    }
    
    // For now: Delete entire product (temporary solution)
    console.log(`🗑️ Deleting raw product: ${resolvedProductId} (TEMP: should be qty decrement)`)
    
    const deleteResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/products/${resolvedProductId}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token }
    })
    
    if (deleteResponse.ok || deleteResponse.status === 404) {
      console.log(`✅ Successfully deleted raw product ${resolvedProductId}`)
      
      // Update database
      if (itemId) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'raw_product_delete_temp',
            shopify_product_id: null,
            shopify_variant_id: null,
            shopify_inventory_item_id: null,
            shopify_sync_status: 'removed',
            last_shopify_removal_error: null
          })
          .eq('id', itemId)
      }
      
      return json(200, {
        ok: true,
        action: 'deleted',
        message: 'Raw card product deleted (temporary - should implement quantity decrement)',
        diagnostics: {
          storeKey,
          domain,
          sku,
          quantity,
          productId: resolvedProductId,
          ms: Date.now() - startTime
        }
      })
    } else {
      throw new Error(`Failed to delete raw product: ${deleteResponse.status}`)
    }
    
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