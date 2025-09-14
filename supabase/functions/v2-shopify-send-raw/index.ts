import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { loadStore, fetchRetry, parseIdFromGid, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, parseNumericIdFromGid, setInventory } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export interface SendRawArgs {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku: string
    brand_title?: string
    subject?: string
    card_number?: string
    image_url?: string
    cost?: number
    title?: string
    price?: number
    barcode?: string
    condition?: string
    quantity?: number
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  })
  
  const run = newRun()
  
  try {
    const args: SendRawArgs = await req.json().catch(() => ({}))
    const { storeKey, locationGid, item } = args
    
    if (!storeKey || !locationGid || !item || !item.sku) {
      return json(400, { error: 'Expected { storeKey, locationGid, item: { sku } }' })
    }

    console.info('raw.send.start', { correlationId: run.correlationId, storeKey, locationGid, itemId: item.id, sku: item.sku })

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })
    
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) return json(400, { ok: false, error: 'Invalid locationGid' })

    // For raw cards, search by SKU to find existing product/variant
    const GQL = `
      query($q: String!) {
        productVariants(first: 10, query: $q) {
          nodes {
            id
            sku
            barcode
            product { 
              id 
              title 
              status 
              tags
              variants(first: 20) {
                nodes {
                  id
                  sku
                  title
                  inventoryItem { id }
                }
              }
            }
            inventoryItem { id }
          }
        }
      }`
    
    const { ok: gok, status: gstatus, body: gbody } = await shopifyGraphQL(domain, token, GQL, { q: `sku:${item.sku}` })
    run.add({ name: 'lookupBySku', ok: gok, status: gstatus, data: { count: gbody?.data?.productVariants?.nodes?.length || 0 } })
    const skuHits = gok ? (gbody?.data?.productVariants?.nodes || []) : []

    let productId: string, variantId: string, inventoryItemId: string
    let decision: 'reuse-sku' | 'add-variant' | 'created' = 'created'

    if (skuHits.length) {
      // Found existing variant with same SKU - reuse it
      const chosen = skuHits.find((n: any) => n?.product?.status === 'ACTIVE') || skuHits[0]
      productId = parseNumericIdFromGid(chosen.product.id) || ''
      variantId = parseNumericIdFromGid(chosen.id) || ''
      inventoryItemId = parseNumericIdFromGid(chosen.inventoryItem.id) || ''
      decision = 'reuse-sku'
      run.add({ name: 'reuseVariant', ok: true, data: { reason: 'sku', variantId, productId } })
    } else {
      // Check if we can add a variant to an existing similar product
      // Look for products with similar title/brand
      const searchTitle = item.title || `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim()
      
      if (searchTitle.length > 10) {
        // Try to find similar product by title
        const titleQuery = searchTitle.split(' ').slice(0, 3).join(' ')
        const { ok: tok, status: tstatus, body: tbody } = await shopifyGraphQL(domain, token, `
          query($q: String!) {
            products(first: 5, query: $q) {
              nodes {
                id
                title
                status
                variants(first: 20) {
                  nodes {
                    id
                    sku
                    inventoryItem { id }
                  }
                }
              }
            }
          }`, { q: `title:*${titleQuery}*` })
        
        run.add({ name: 'lookupByTitle', ok: tok, status: tstatus, data: { count: tbody?.data?.products?.nodes?.length || 0 } })
        
        const titleHits = tok ? (tbody?.data?.products?.nodes || []) : []
        const suitableProduct = titleHits.find((p: any) => 
          p?.status === 'ACTIVE' && 
          p?.variants?.nodes?.length < 20 && // Don't add to products with too many variants
          !p?.variants?.nodes?.some((v: any) => v.sku === item.sku) // Make sure SKU doesn't already exist
        )
        
        if (suitableProduct) {
          // Add variant to existing product
          const payload = {
            variant: {
              product_id: parseNumericIdFromGid(suitableProduct.id),
              sku: item.sku,
              barcode: item.barcode || item.sku,
              price: item.price != null ? Number(item.price).toFixed(2) : undefined,
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              title: item.condition ? `${item.condition} Condition` : undefined,
              weight: 0.1,
              weight_unit: 'lb'
            }
          }
          
          const vr = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${parseNumericIdFromGid(suitableProduct.id)}/variants.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          const vb = await vr.json()
          if (vr.ok) {
            productId = String(parseNumericIdFromGid(suitableProduct.id))
            variantId = String(vb.variant?.id)
            inventoryItemId = String(vb.variant?.inventory_item_id)
            decision = 'add-variant'
            run.add({ name: 'addVariant', ok: true, data: { productId, variantId, inventoryItemId } })
          } else {
            console.warn(`⚠️ Failed to add variant: ${vr.status} ${JSON.stringify(vb)}`)
          }
        }
      }
      
      // If we couldn't add variant, create new product
      if (!productId) {
        const payload = {
          product: {
            status: 'active',
            title: item.title || `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim() || `Card ${item.sku}`,
            body_html: `<p><strong>Raw Trading Card</strong></p><p>Condition: ${item.condition || 'Good'}</p><p>SKU: ${item.sku}</p>`,
            vendor: item.brand_title || 'Trading Cards',
            product_type: 'Trading Card',
            tags: [
              'raw',
              'trading-card',
              item.brand_title,
              item.condition
            ].filter(Boolean).join(', '),
            variants: [{
              sku: item.sku,
              barcode: item.barcode || item.sku,
              price: item.price != null ? Number(item.price).toFixed(2) : undefined,
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              weight: 0.1,
              weight_unit: 'lb'
            }]
          }
        }
        
        const cr = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products.json`, {
          method: 'POST', 
          headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const cb = await cr.json()
        if (!cr.ok) throw new Error(`Create failed ${cr.status}: ${JSON.stringify(cb)}`)
        
        productId = String(cb.product?.id)
        variantId = String(cb.product?.variants?.[0]?.id)
        inventoryItemId = String(cb.product?.variants?.[0]?.inventory_item_id)
        
        run.add({ name: 'createProduct', ok: true, data: { productId, variantId, inventoryItemId } })
      }
    }

    // Set inventory quantity
    const quantity = item.quantity || 1
    if (quantity > 0) {
      const { ok: iok, status: istatus } = await setInventory(domain, token, inventoryItemId, locationId, quantity)
      run.add({ name: 'setInventory', ok: iok, status: istatus, data: { quantity, locationId, inventoryItemId } })
      if (!iok) {
        console.warn(`⚠️ Inventory set failed for raw item ${item.id}`)
      }
    }

    console.info('raw.send.success', { 
      correlationId: run.correlationId, 
      productId, 
      variantId, 
      sku: item.sku,
      decision,
      quantity 
    })

    return json(200, {
      ok: true,
      productId,
      variantId,
      inventoryItemId,
      decision,
      diagnostics: {
        correlationId: run.correlationId,
        storeKey,
        domain: slug,
        locationId,
        sku: item.sku,
        quantity,
        steps: run.steps
      }
    })

  } catch (error: any) {
    console.error('raw.send.error', { correlationId: run.correlationId, error: error.message })
    
    return json(500, {
      ok: false,
      error: error.message || 'Internal error',
      diagnostics: {
        correlationId: run.correlationId,
        steps: run.steps
      }
    })
  }
})