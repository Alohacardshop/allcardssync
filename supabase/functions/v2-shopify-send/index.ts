// Minimal, reliable "send to Shopify" for Inventory with audit logging
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { CORS, json, loadStore, findVariantsBySKU, publishIfNeeded, setInventory, parseIdFromGid, fetchRetry, newRun, deriveStoreSlug, API_VER } from '../_shared/shopify-helpers.ts'

async function createProduct(domain: string, token: string, sku: string, title?: string | null, price?: number | null, barcode?: string | null) {
  const payload = {
    product: {
      title: title || sku,
      status: 'active',
      variants: [{
        sku,
        price: price != null ? Number(price).toFixed(2) : undefined,
        barcode: barcode || undefined,
        inventory_management: 'shopify'
      }]
    }
  }
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Create product failed: ${r.status} ${JSON.stringify(b)}`)
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
    const { storeKey, sku, title, price, barcode, locationGid, quantity, intakeItemId } = await req.json().catch(() => ({}))
    if (!storeKey || !sku || !locationGid || quantity == null) {
      return json(400, { error: 'Expected { storeKey, sku, locationGid, quantity, title?, price?, barcode?, intakeItemId? }' })
    }

    console.info('send.start', { correlationId: run.correlationId, storeKey, locationGid, sku, quantity })

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })

    // Find or create variant
    let productId: string, variantId: string, inventoryItemId: string
    
    try {
      const matches = await findVariantsBySKU(domain, token, sku)
      run.add({ name: 'findVariants', ok: true, data: { count: matches.length } })

      if (matches.length) {
        const v = matches.find((x: any) => x?.product?.status === 'active') || matches[0]
        productId = String(v.product_id)
        variantId = String(v.id)
        inventoryItemId = String(v.inventory_item_id)
        run.add({ name: 'reuseVariant', ok: true, data: { productId, variantId, inventoryItemId } })
        
        try {
          await publishIfNeeded(domain, token, productId)
          run.add({ name: 'publishIfNeeded', ok: true })
        } catch (e: any) {
          run.add({ name: 'publishIfNeeded', ok: false, note: e?.message })
          throw e
        }
      } else {
        try {
          const p = await createProduct(domain, token, sku, title, price, barcode)
          productId = String(p.id)
          variantId = String(p.variants?.[0]?.id)
          inventoryItemId = String(p.variants?.[0]?.inventory_item_id)
          run.add({ name: 'createProduct', ok: true, data: { productId, variantId, inventoryItemId } })
        } catch (e: any) {
          run.add({ name: 'createProduct', ok: false, note: e?.message })
          throw e
        }
      }
    } catch (e: any) {
      run.add({ name: 'findVariants', ok: false, note: e?.message })
      throw e
    }

    // Set inventory at selected location
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) throw new Error('Invalid locationGid')
    
    try {
      await setInventory(domain, token, inventoryItemId, String(locationId), Number(quantity))
      run.add({ name: 'setInventory', ok: true, data: { locationId, quantity } })
    } catch (e: any) {
      run.add({ name: 'setInventory', ok: false, note: e?.message })
      throw e
    }

    // Write back IDs to intake_items with full snapshot
    if (intakeItemId) {
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
          input: { storeKey, sku, quantity, locationGid, locationId },
          store: { domain, slug },
          result: { productId, variantId, inventoryItemId },
          steps: run.steps,
        },
      }).eq('id', intakeItemId)
    }

    console.info('send.ok', { correlationId: run.correlationId, productId, variantId, locationId })

    return json(200, { 
      ok: true, 
      productId, 
      variantId, 
      inventoryItemId,
      locationId,
      correlationId: run.correlationId,
      productAdminUrl: `https://${slug}.myshopify.com/admin/products/${productId}`,
      variantAdminUrl: `https://${slug}.myshopify.com/admin/products/${productId}/variants/${variantId}`
    })
  } catch (e: any) {
    console.warn('send.fail', { correlationId: run.correlationId, message: e?.message })
    
    // Write partial snapshot on error
    const { intakeItemId } = await req.json().catch(() => ({}))
    if (intakeItemId) {
      await supabase.from('intake_items').update({
        shopify_sync_status: 'error',
        last_shopify_sync_error: e?.message || 'Internal error',
        last_shopify_correlation_id: run.correlationId,
        shopify_sync_snapshot: {
          steps: run.steps,
          error: e?.message || 'Internal error'
        },
      }).eq('id', intakeItemId)
    }
    
    return json(500, { ok: false, error: e?.message || 'Internal error', correlationId: run.correlationId })
  }
})