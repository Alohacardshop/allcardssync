// Specialized function for removing graded cards from Shopify
// Graded cards are 1-of-1 unique items, so we delete the entire product
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
    const { storeKey, productId, sku, locationGid, itemId, certNumber } = await req.json().catch(() => ({}))
    
    if (!storeKey) {
      return json(400, { error: 'storeKey is required' })
    }

    console.log(`🎯 GRADED REMOVAL: cert ${certNumber}, SKU ${sku}, productId ${productId}`)
    
    // Load Shopify credentials
    const { domain, token } = await loadStore(supabase, storeKey)
    
    let resolvedProductId = productId
    
    // If no product ID provided, find it by SKU
    if (!resolvedProductId && sku) {
      console.log(`🔍 Finding product by SKU: ${sku}`)
      
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
          const productNode = result.data.productVariants.edges[0].node.product
          resolvedProductId = productNode.id.split('/').pop()
          console.log(`✅ Found product: ${productNode.title} (${productNode.status})`)
        }
      }
    }
    
    if (!resolvedProductId) {
      console.log(`⚠️ No product found for SKU ${sku}`)
      
      // Update database - mark as removed since nothing to delete
      if (itemId) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'graded_not_found',
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
        message: 'Product not found in Shopify (may already be deleted)',
        diagnostics: {
          storeKey,
          domain,
          sku,
          certNumber,
          ms: Date.now() - startTime
        }
      })
    }
    
    // Delete the entire product (graded cards are unique 1-of-1 items)
    console.log(`🗑️ Deleting graded product: ${resolvedProductId}`)
    
    const deleteResponse = await fetchRetry(`https://${domain}/admin/api/2024-07/products/${resolvedProductId}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token }
    })
    
    if (deleteResponse.ok || deleteResponse.status === 404) {
      console.log(`✅ Successfully deleted graded product ${resolvedProductId}`)
      
      // Update database
      if (itemId) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'graded_product_delete',
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
        message: 'Graded card product deleted from Shopify',
        diagnostics: {
          storeKey,
          domain,
          sku,
          certNumber,
          productId: resolvedProductId,
          ms: Date.now() - startTime
        }
      })
    } else {
      throw new Error(`Failed to delete product: ${deleteResponse.status} ${deleteResponse.statusText}`)
    }
    
  } catch (error: any) {
    console.error('🚨 Graded removal error:', error)
    
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
      diagnostics: {
        ms: Date.now() - startTime
      }
    })
  }
})