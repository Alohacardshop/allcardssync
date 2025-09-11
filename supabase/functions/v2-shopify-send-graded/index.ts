// Graded card sender for Shopify - STRICT PSA barcode enforcement with rich metadata
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { CORS, json, loadStore, parseIdFromGid, fetchRetry, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, onlyDigits, parseNumericIdFromGid } from '../_shared/shopify-helpers.ts'

function extractGradeNumber(grade?: string | null): string | null {
  if (!grade) return null
  const match = grade.match(/(\d+(?:\.\d+)?)/)
  return match ? match[1] : null
}

const upper = (s?: string) => (s || "").toUpperCase().trim();

function formatGradedTitle(it: any) {
  const year = it.year ?? '';
  const brand = upper(it.brand_title ?? '');
  const num = it.card_number ? `#${String(it.card_number).trim()}` : '';
  const subject = upper(it.subject ?? '');
  const variant = it.variant && it.variant !== 'Raw' ? `-${upper(it.variant)}` : '';
  const grade = it.grade ? ` PSA ${String(it.grade).trim()}` : '';
  // e.g. 2025 POKEMON JTG EN-JOURNEY TOGETHER #176 HOP'S ZACIAN EX-ULTRA RARE PSA 10
  return `${year} ${brand} ${num} ${subject}${variant}${grade}`.replace(/\s+/g,' ').trim();
}

function formatGradedDescription(it: any, cert: string) {
  const title = formatGradedTitle(it);
  return `${title} — Cert ${cert}`;
}

function buildTags(it: any) {
  const tags = new Set<string>([
    'graded',
    'PSA',
    it.grade ? `Grade ${it.grade}` : '',
    it.category_tag || 'Pokemon',
  ].filter(Boolean) as string[]);
  // Explicitly remove tags we don't want
  tags.delete('graded-5');
  tags.delete('intake');
  return Array.from(tags).join(', ');
}

async function updateInventoryItemCost(domain: string, token: string, inventoryItemId: string, cost: number) {
  const payload = {
    inventory_item: {
      id: inventoryItemId,
      cost: cost.toFixed(2)
    }
  }
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_items/${inventoryItemId}.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error(`Update cost failed: ${r.status} ${await r.text()}`)
  return await r.json()
}

async function createGradedProduct(domain: string, token: string, item: any, cert: string) {
  const title = formatGradedTitle(item) || `Graded Card — PSA ${cert}`
  const description = formatGradedDescription(item, cert)
  const tags = buildTags(item)
  
  const payload = {
    product: {
      title,
      body_html: description,
      status: 'active',
      product_type: item.category_tag || 'Pokemon',
      tags,
      images: item.image_url ? [{ src: item.image_url }] : [],
      variants: [{
        sku: item.sku || cert,
        barcode: cert,
        price: item.price != null ? Number(item.price).toFixed(2) : undefined,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        weight: 3,
        weight_unit: 'oz',
        requires_shipping: true
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
  
  // Update cost if provided
  if (item.cost != null && b.product?.variants?.[0]?.inventory_item_id) {
    try {
      await updateInventoryItemCost(domain, token, String(b.product.variants[0].inventory_item_id), Number(item.cost))
    } catch (e) {
      console.warn('Failed to set cost on new product:', e)
    }
  }
  
  return b.product
}

async function updateExistingProduct(domain: string, token: string, productId: string, variantId: string, inventoryItemId: string, item: any, cert: string) {
  const title = formatGradedTitle(item) || `Graded Card — PSA ${cert}`
  const description = formatGradedDescription(item, cert)
  const tags = buildTags(item)
  
  // Update product
  const productPayload = {
    product: {
      id: productId,
      title,
      body_html: description,
      tags,
      product_type: item.category_tag || 'Pokemon'
    }
  }
  
  if (item.image_url) {
    productPayload.product.images = [{ src: item.image_url }]
  }
  
  const pr = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(productPayload)
  })
  
  if (!pr.ok) {
    console.warn(`Product update failed: ${pr.status}`)
  }
  
  // Update variant
  const variantPayload = {
    variant: {
      id: variantId,
      weight: 3,
      weight_unit: 'oz',
      requires_shipping: true
    }
  }
  
  const vr = await fetchRetry(`https://${domain}/admin/api/${API_VER}/variants/${variantId}.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(variantPayload)
  })
  
  if (!vr.ok) {
    console.warn(`Variant update failed: ${vr.status}`)
  }
  
  // Update cost if provided
  if (item.cost != null) {
    try {
      await updateInventoryItemCost(domain, token, inventoryItemId, Number(item.cost))
    } catch (e) {
      console.warn('Failed to update cost:', e)
    }
  }
}

async function getProduct(domain: string, token: string, id: string) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${id}.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Fetch product failed: ${r.status}`)
  return b.product
}

async function publishIfNeeded(domain: string, token: string, productId: string) {
  const p = await getProduct(domain, token, productId)
  if (p?.status !== 'active') {
    const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { id: productId, status: 'active' } })
    })
    if (!r.ok) throw new Error(`Publish failed: ${r.status}`)
  }
}

async function setInventory(domain: string, token: string, inventory_item_id: string, location_id: string, available: number) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory_item_id, location_id, available })
  })
  if (!r.ok) throw new Error(`Inventory set failed: ${r.status} ${await r.text()}`)
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

    // STRICT: barcode MUST equal PSA cert (digits only)
    const cert = onlyDigits(item.psa_cert || item.barcode || item.sku || '')
    if (!cert) return json(400, { ok: false, error: 'Missing PSA cert/barcode for graded item' })
    
    const skuToUse = item.sku || cert  // SKU can be anything; falls back to cert
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) return json(400, { ok: false, error: 'Invalid locationGid' })

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
    let resultMeta: any = {}
    
    if (!chosen) {
      const newProduct = await createGradedProduct(domain, token, item, cert)
      chosen = {
        id: `gid://shopify/ProductVariant/${newProduct?.variants?.[0]?.id}`,
        product: { id: `gid://shopify/Product/${newProduct?.id}`, status: newProduct?.status, tags: newProduct?.tags, title: newProduct?.title },
        barcode: cert,
        sku: newProduct?.variants?.[0]?.sku,
        inventoryItem: { id: `gid://shopify/InventoryItem/${newProduct?.variants?.[0]?.inventory_item_id}` }
      }
      run.add({ name: 'createdCanonical', ok: true, data: { productId: newProduct?.id, variantId: newProduct?.variants?.[0]?.id, barcode: cert } })
      
      resultMeta = {
        appliedTitle: newProduct?.title,
        appliedTags: newProduct?.tags,
        weight: '3 oz',
        costPushed: item.cost != null,
        imageAttached: !!item.image_url
      }
    } else {
      // Update existing product/variant with new metadata
      const pId = parseNumericIdFromGid(chosen.product.id) || ''
      const vId = parseNumericIdFromGid(chosen.id) || ''
      const iId = parseNumericIdFromGid(chosen.inventoryItem.id) || ''
      
      await updateExistingProduct(domain, token, pId, vId, iId, item, cert)
      run.add({ name: 'updatedExisting', ok: true, data: { productId: pId, variantId: vId } })
      
      resultMeta = {
        appliedTitle: formatGradedTitle(item) || `Graded Card — PSA ${cert}`,
        appliedTags: buildTags(item),
        weight: '3 oz',
        costPushed: item.cost != null,
        imageAttached: !!item.image_url
      }
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
          resultMeta,
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
      locationId: String(locationId),
      correlationId: run.correlationId,
      enforcedBarcode: cert,
      decision: barcodeHits.length ? 'reuse-barcode' : (run.steps.find(s => s.name === 'reuseVariant' && s.data?.reason === 'sku+barcode') ? 'reuse-sku+barcode' : 'created'),
      productAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}`,
      variantAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}/variants/${variantId}`,
      resultMeta
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
