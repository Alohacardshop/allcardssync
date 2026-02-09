// Admin tool to relink graded items with correct PSA cert barcode
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { CORS, json, loadStore, onlyDigits, parseIdFromGid, fetchRetry, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, parseNumericIdFromGid, setInventory } from '../_shared/shopify-helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  // JWT validation for mutating endpoint
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('❌ Missing or invalid Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const token = authHeader.replace('Bearer ', '');
  
  // Verify JWT token
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!, 
    Deno.env.get('SUPABASE_ANON_KEY')!
  );
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  
  if (authError || !user) {
    console.error('❌ Invalid JWT token:', authError);
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
  
  console.log('✅ Authenticated user:', user.id);
  
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }
  })
  
  const run = newRun()
  
  try {
    const { storeKey, locationGid, itemId, psaCert, quantity } = await req.json().catch(() => ({}))
    if (!storeKey || !locationGid || !itemId || !psaCert) {
      return json(400, { error: 'Expected { storeKey, locationGid, itemId, psaCert, quantity }' })
    }

    console.info('relink.start', { correlationId: run.correlationId, itemId, psaCert })

    // Load item details
    const { data: itemData, error: itemError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', itemId)
      .single()
    
    if (itemError || !itemData) {
      return json(404, { ok: false, error: 'Item not found' })
    }

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })

    // Enforce barcode = PSA cert (digits only)
    const cert = onlyDigits(psaCert)
    if (!cert) return json(400, { ok: false, error: 'Invalid PSA cert number' })
    
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
      const payload = {
        product: {
          status: 'active',
          title: itemData.title || itemData.brand_title || `Graded Card — PSA ${cert}`,
          tags: [
            'graded',
            'psa',
            `cert-${cert}`,
            itemData.grade ? `grade-${String(itemData.grade).replace(/\s+/g,'').toLowerCase()}` : null
          ].filter(Boolean).join(', '),
          variants: [{
            sku: itemData.sku || cert,
            barcode: cert,  // MUST equal cert
            price: itemData.price != null ? Number(itemData.price).toFixed(2) : undefined,
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
      
      productId = String(cb.product?.id)
      variantId = String(cb.product?.variants?.[0]?.id)
      inventoryItemId = String(cb.product?.variants?.[0]?.inventory_item_id)
      decision = 'created'
      run.add({ name: 'createdCanonical', ok: true, data: { productId, variantId, barcode: cert } })
    }

    // Set inventory at location
    const qtyToUse = Number(quantity) || Number(itemData.quantity) || 1
    try {
      await setInventory(domain, token, inventoryItemId, String(locationId), qtyToUse)
      run.add({ name: 'setInventory', ok: true, data: { locationId, quantity: qtyToUse } })
    } catch (e: any) {
      run.add({ name: 'setInventory', ok: false, note: e?.message })
      throw e
    }

    // Update item with new IDs and snapshot
    const snapshot = {
      input: { storeKey, locationGid, locationId, sku: itemData.sku, quantity: qtyToUse, relinked: true },
      store: { domain, slug },
      result: { productId, variantId, inventoryItemId },
      graded: {
        enforcedBarcode: cert,
        decision,
        relinked: true
      },
      steps: run.steps,
    }

    await supabase.from('intake_items').update({
      shopify_product_id: productId,
      shopify_variant_id: variantId,
      shopify_inventory_item_id: inventoryItemId,
      pushed_at: new Date().toISOString(),
      shopify_sync_status: 'synced',
      last_shopify_synced_at: new Date().toISOString(),
      last_shopify_correlation_id: run.correlationId,
      last_shopify_location_gid: locationGid,
      last_shopify_store_key: storeKey,
      shopify_sync_snapshot: snapshot,
    }).eq('id', itemId)

    console.info('relink.ok', { correlationId: run.correlationId, productId, variantId, decision })

    return json(200, { 
      ok: true, 
      productId, 
      variantId, 
      inventoryItemId,
      locationId,
      correlationId: run.correlationId,
      decision,
      enforcedBarcode: cert,
      productAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}`,
      variantAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}/variants/${variantId}`
    })
  } catch (e: any) {
    console.warn('relink.fail', { correlationId: run.correlationId, message: e?.message })
    
    return json(500, { ok: false, error: e?.message || 'Internal error', correlationId: run.correlationId })
  }
})