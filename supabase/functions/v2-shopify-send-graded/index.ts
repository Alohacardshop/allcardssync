// Graded card sender for Shopify (PSA certs, unique single-variant products)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { CORS, json, loadStore, findVariantsBySKU, publishIfNeeded, setInventory, parseIdFromGid, fetchRetry, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, onlyDigits, parseNumericIdFromGid, getProduct } from '../_shared/shopify-helpers.ts'

function extractGradeNumber(grade?: string | null): string | null {
  if (!grade) return null
  const match = grade.match(/(\d+(?:\.\d+)?)/)
  return match ? match[1] : null
}

async function createGradedProduct(domain: string, token: string, sku: string, barcode: string, title?: string | null, price?: number | null, tags: string[] = []) {
  const payload = {
    product: {
      title: title || sku,
      status: 'active',
      tags: tags.filter(Boolean).join(', '),
      variants: [{
        sku,
        barcode,
        price: price != null ? Number(price).toFixed(2) : undefined,
        inventory_management: 'shopify',
        inventory_policy: 'deny'
      }]
    }
  }
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Create graded product failed: ${r.status} ${JSON.stringify(b)}`)
  return b.product
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  })
  
  const run = newRun()
  
  try {
    const { storeKey, locationGid, item } = await req.json().catch(() => ({}))
    if (!storeKey || !locationGid || !item) {
      return json(400, { error: 'Expected { storeKey, locationGid, item }' })
    }

    console.info('send.start', { correlationId: run.correlationId, storeKey, locationGid, sku: item.sku, quantity: item.quantity })

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })

    // Derive the canonical cert number (barcode enforcement for graded items)
    const cert = onlyDigits(item.psa_cert || item.barcode || '')
    if (!cert) return json(400, { ok: false, error: 'Missing PSA cert/barcode for graded item' })
    
    const skuToUse = item.sku || cert  // SKU can be anything; falls back to cert

    // Build tags
    const baseTags = [item.category, item.variant, item.lot_number ? `lot-${item.lot_number}` : null, 'intake', item.game]
    const gradedTags = ['graded']
    if (item.psa_cert) gradedTags.push('PSA')
    const gradeNum = extractGradeNumber(item.grade)
    if (gradeNum) gradedTags.push(`grade-${gradeNum}`)
    gradedTags.push(`cert-${cert}`)
    
    const allTags = [...baseTags.filter(Boolean), ...gradedTags]

    // A) GraphQL search by barcode first
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

    // B) Strict reuse rule - only if barcode matches exactly
    let chosen: any = null
    if (barcodeHits.length) {
      // Pick first active if present, otherwise first match
      chosen = barcodeHits.find((n: any) => n?.product?.status === 'ACTIVE') || barcodeHits[0]
      run.add({ name: 'reuseVariant', ok: true, data: { reason: 'barcode', variantGid: chosen.id, productGid: chosen.product.id } })
    }

    // C) Fallback: look by SKU then reject if barcode mismatch
    if (!chosen && item.sku) {
      const rest = await fetchRetry(`https://${domain}/admin/api/${API_VER}/variants.json?sku=${encodeURIComponent(item.sku)}&limit=50`, {
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
      })
      const restBody = await rest.json()
      const matches = (restBody?.variants as any[]) || []
      run.add({ name: 'lookupBySku', ok: rest.ok, status: rest.status, data: { count: matches.length } })
      
      // Pull product for each candidate and keep ONLY exact-barcode matches
      const candidates: any[] = []
      for (const v of matches) {
        try {
          const p = await getProduct(domain, token, String(v.product_id))
          candidates.push({ v, p, ok: String(v.barcode || '') === cert })
        } catch { /* ignore fetch errors */ }
      }
      
      const exact = candidates.filter(x => x.ok)
      if (exact.length) {
        const best = exact.find(x => x.p?.status === 'active') || exact[0]
        chosen = {
          id: `gid://shopify/ProductVariant/${best.v.id}`,
          product: { id: `gid://shopify/Product/${best.p.id}`, status: best.p.status, tags: best.p.tags, title: best.p.title },
          barcode: best.v.barcode,
          sku: best.v.sku,
          inventoryItem: { id: `gid://shopify/InventoryItem/${best.v.inventory_item_id}` }
        }
        run.add({ name: 'reuseVariant', ok: true, data: { reason: 'sku+barcode', variantId: best.v.id, productId: best.p.id } })
      } else if (matches.length) {
        // SKU found but barcode(s) don't match → collision
        run.add({ name: 'collision', ok: false, data: {
          cert, sku: item.sku, candidates: matches.map(v => ({ productId: v.product_id, variantId: v.id, barcode: v.barcode }))
        } })
      }
    }

    // D) Create new canonical graded product when no strict match
    let productId: string, variantId: string, inventoryItemId: string
    
    if (!chosen) {
      const payload = {
        product: {
          status: 'active',
          title: item.title || `Graded Card — PSA ${cert}`,
          tags: allTags.filter(Boolean).join(', '),
          variants: [{
            sku: skuToUse,
            barcode: cert,  // MUST equal cert
            price: item.price != null ? Number(item.price).toFixed(2) : undefined,
            inventory_management: 'shopify',
            inventory_policy: 'deny',
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
      
      chosen = {
        id: `gid://shopify/ProductVariant/${cb.product?.variants?.[0]?.id}`,
        product: { id: `gid://shopify/Product/${cb.product?.id}`, status: cb.product?.status, tags: cb.product?.tags, title: cb.product?.title },
        barcode: cert,
        sku: cb.product?.variants?.[0]?.sku,
        inventoryItem: { id: `gid://shopify/InventoryItem/${cb.product?.variants?.[0]?.inventory_item_id}` }
      }
      run.add({ name: 'createdCanonical', ok: true, data: { productId: cb.product?.id, variantId: cb.product?.variants?.[0]?.id, barcode: cert } })
    }

    // Parse numeric IDs for further operations
    productId = parseNumericIdFromGid(chosen.product.id) || ''
    variantId = parseNumericIdFromGid(chosen.id) || ''
    inventoryItemId = parseNumericIdFromGid(chosen.inventoryItem.id) || ''

    // Publish if needed
    try {
      await publishIfNeeded(domain, token, productId)
      run.add({ name: 'publishIfNeeded', ok: true })
    } catch (e: any) {
      run.add({ name: 'publishIfNeeded', ok: false, note: e?.message })
      throw e
    }

    // Set inventory at selected location
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) throw new Error('Invalid locationGid')
    
    try {
      await setInventory(domain, token, inventoryItemId, String(locationId), Number(item.quantity || 1))
      run.add({ name: 'setInventory', ok: true, data: { locationId, quantity: item.quantity || 1 } })
    } catch (e: any) {
      run.add({ name: 'setInventory', ok: false, note: e?.message })
      throw e
    }

    // Write back IDs to intake_items with full snapshot
    if (item.id) {
      await supabase.from('intake_items').update({
        shopify_product_id: productId,
        shopify_variant_id: variantId,
        shopify_inventory_item_id: inventoryItemId,
        pushed_at: new Date().toISOString(),
        shopify_sync_status: 'success',
        last_shopify_synced_at: new Date().toISOString(),
        last_shopify_correlation_id: run.correlationId,
        last_shopify_location_gid: locationGid,
        last_shopify_store_key: storeKey,
        shopify_sync_snapshot: {
          input: { storeKey, sku: skuToUse, quantity: item.quantity || 1, locationGid, locationId },
          store: { domain, slug },
          result: { productId, variantId, inventoryItemId },
          graded: {
            enforcedBarcode: cert,
            decision: barcodeHits.length ? 'reuse-barcode' : (run.steps.find(s => s.name === 'reuseVariant' && s.data?.reason === 'sku+barcode') ? 'reuse-sku+barcode' : 'created'),
            collisions: run.steps.find(s => s.name === 'collision')?.data || null
          },
          steps: run.steps,
        },
      }).eq('id', item.id)
    }

    console.info('send.ok', { correlationId: run.correlationId, productId, variantId, locationId })

    return json(200, { 
      ok: true, 
      productId, 
      variantId, 
      inventoryItemId,
      locationId,
      correlationId: run.correlationId,
      productAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}`,
      variantAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}/variants/${variantId}`
    })
  } catch (e: any) {
    console.warn('send.fail', { correlationId: run.correlationId, message: e?.message })
    
    // Write partial snapshot on error
    if (req.json && (await req.json().catch(() => ({})))?.item?.id) {
      const { item } = await req.json().catch(() => ({}))
      await supabase.from('intake_items').update({
        shopify_sync_status: 'error',
        last_shopify_sync_error: e?.message || 'Internal error',
        last_shopify_correlation_id: run.correlationId,
        shopify_sync_snapshot: {
          input: { storeKey: (await req.json().catch(() => ({})))?.storeKey, sku: item?.sku, locationGid: (await req.json().catch(() => ({})))?.locationGid },
          graded: { enforcedBarcode: cert || 'unknown', decision: 'error' },
          steps: run.steps,
          error: e?.message || 'Internal error'
        },
      }).eq('id', item.id)
    }
    
    return json(500, { ok: false, error: e?.message || 'Internal error', correlationId: run.correlationId })
  }
})