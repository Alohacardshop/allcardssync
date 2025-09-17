import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { loadStore, fetchRetry, parseIdFromGid, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, parseNumericIdFromGid, setInventory, onlyDigits } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export interface SendGradedArgs {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku?: string
    psa_cert?: string
    barcode?: string
    title?: string
    price?: number
    grade?: string
    quantity?: number
    // Extended metadata for graded title/description/images
    year?: string
    brand_title?: string
    subject?: string
    card_number?: string
    variant?: string
    category_tag?: string
    image_url?: string
    cost?: number
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
    const args: SendGradedArgs = await req.json().catch(() => ({}))
    const { storeKey, locationGid, item } = args
    
    if (!storeKey || !locationGid || !item) {
      return json(400, { error: 'Expected { storeKey, locationGid, item }' })
    }

    console.info('graded.send.start', { correlationId: run.correlationId, storeKey, locationGid, itemId: item.id })

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })

    // For graded cards, enforce barcode = PSA cert (digits only)
    const cert = onlyDigits(item.psa_cert || item.barcode || '')
    if (!cert) return json(400, { ok: false, error: 'PSA cert/barcode required for graded cards' })
    
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) return json(400, { ok: false, error: 'Invalid locationGid' })

    // GraphQL search by barcode first
    const GQL = `
      query($q: String!) {
        productVariants(first: 50, query: $q) {
          nodes {
            id
            sku
            barcode
            product { id title status tags }
            inventoryItem { id }
          }
        }
      }`
    
    const { ok: gok, status: gstatus, body: gbody } = await shopifyGraphQL(domain, token, GQL, { q: `barcode:${cert}` })
    run.add({ name: 'lookupByBarcode', ok: gok, status: gstatus, data: { count: gbody?.data?.productVariants?.nodes?.length || 0 } })
    const barcodeHits = gok ? (gbody?.data?.productVariants?.nodes || []) : []

    let productId: string, variantId: string, inventoryItemId: string
    let decision: 'reuse-barcode' | 'created' = 'created'

    if (barcodeHits.length) {
      // Reuse existing variant with exact barcode match
      const chosen = barcodeHits.find((n: any) => n?.product?.status === 'ACTIVE') || barcodeHits[0]
      productId = parseNumericIdFromGid(chosen.product.id) || ''
      variantId = parseNumericIdFromGid(chosen.id) || ''
      inventoryItemId = parseNumericIdFromGid(chosen.inventoryItem.id) || ''
      decision = 'reuse-barcode'
      run.add({ name: 'reuseVariant', ok: true, data: { reason: 'barcode', variantId, productId } })
    } else {
      // Create new canonical graded product
      const fullTitle = item.title || `${item.brand_title || ''} ${item.subject || ''} #${item.card_number || ''} PSA ${item.grade || ''} ${cert}`.trim()
      const storeVendor = storeKey === 'hawaii' ? 'Aloha Card Shop Hawaii' : 'Aloha Card Shop Las Vegas'
      
      const payload = {
        product: {
          status: 'active',
          title: fullTitle,
          body_html: `<p>${fullTitle}</p><p>SKU: ${item.sku || cert}</p>`,
          vendor: storeVendor,
          product_type: 'Graded Cards',
          tags: [
            'graded',
            'single',
            item.grade ? String(item.grade) : null,
            cert
          ].filter(Boolean).join(', '),
          variants: [{
            sku: item.sku || cert,
            barcode: cert,  // MUST equal cert for graded cards
            price: item.price != null ? Number(item.price).toFixed(2) : undefined,
            cost: item.cost != null ? Number(item.cost).toFixed(2) : undefined,
            inventory_management: 'shopify',
            inventory_policy: 'deny',
            weight: 0.1, // Default weight for cards
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

    // Set inventory quantity
    const quantity = item.quantity || 1
    if (quantity > 0) {
      const { ok: iok, status: istatus } = await setInventory(domain, token, inventoryItemId, locationId, quantity)
      run.add({ name: 'setInventory', ok: iok, status: istatus, data: { quantity, locationId, inventoryItemId } })
      if (!iok) {
        console.warn(`⚠️ Inventory set failed for graded item ${item.id}`)
      }
    }

    console.info('graded.send.success', { 
      correlationId: run.correlationId, 
      productId, 
      variantId, 
      cert, 
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
        cert,
        quantity,
        steps: run.steps
      }
    })

  } catch (error: any) {
    console.error('graded.send.error', { correlationId: run.correlationId, error: error.message })
    
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