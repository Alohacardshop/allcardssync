// Raw card sender for Shopify - SKU reuse with inventory addition
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { CORS, json, loadStore, parseIdFromGid, fetchRetry, newRun, deriveStoreSlug, API_VER, shopifyGraphQL, parseNumericIdFromGid } from '../_shared/shopify-helpers.ts'

async function createRawProduct(domain: string, token: string, item: any) {
  // Construct title in format: Game,Set #Number CardName,Condition
  let title = ''
  if (item.brand_title && item.subject) {
    const parts = [item.brand_title]
    if (item.card_number) {
      parts.push(`#${item.card_number}`)
    }
    parts.push(item.subject)
    if (item.condition && item.condition !== 'Normal') {
      parts.push(item.condition)
    }
    title = parts.join(',')
  } else {
    title = item.title || item.sku || 'Raw Card'
  }
  
  const description = title // Same as title with all available info
  
  // Clean condition mapping - remove "Normal" and convert to proper format
  let condition = item.condition || 'Near Mint'
  if (condition.toLowerCase() === 'normal') {
    condition = 'Near Mint'
  }
  
  // Extract game from brand_title
  const game = item.brand_title?.split(',')[0]?.toLowerCase() || 'pokemon'
  
  // Simple tags: raw, game, single, condition
  const tags = [
    'raw',
    game,
    'single',
    condition.toLowerCase().replace(/\s+/g, '')
  ].filter(Boolean).join(', ')

  const payload = {
    product: {
      title,
      body_html: description,
      status: 'active',
      product_type: item.category || 'Trading Card',
      tags,
      images: item.image_url ? [{ src: item.image_url }] : undefined,
      variants: [{
        sku: item.sku,
        price: item.price != null ? Number(item.price).toFixed(2) : undefined,
        cost: item.cost != null ? Number(item.cost).toFixed(2) : undefined,
        barcode: item.barcode || undefined,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        requires_shipping: true,
        weight: 1.0,
        weight_unit: 'oz'
      }]
    }
  }
  
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Create raw product failed: ${r.status} ${JSON.stringify(b)}`)
  return b.product
}

async function getCurrentInventoryLevel(domain: string, token: string, inventoryItemId: string, locationId: string) {
  const GQL = `
    query($inventoryItemId: ID!, $locationId: ID!) {
      inventoryLevel(id: "gid://shopify/InventoryLevel/${inventoryItemId}?inventory_item_id=${inventoryItemId}&location_id=${locationId}") {
        available
        location { id }
        item { id }
      }
    }`
  
  const { ok, status, body } = await shopifyGraphQL(domain, token, GQL, { 
    inventoryItemId, 
    locationId 
  })
  
  if (!ok) throw new Error(`Inventory lookup failed: ${status}`)
  return body?.data?.inventoryLevel?.available || 0
}

async function addInventory(domain: string, token: string, inventory_item_id: string, location_id: string, addQuantity: number) {
  // First get current inventory level
  const currentLevel = await getCurrentInventoryLevel(domain, token, inventory_item_id, location_id)
  const newLevel = currentLevel + addQuantity
  
  // Set to new total level
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory_item_id, location_id, available: newLevel })
  })
  if (!r.ok) throw new Error(`Inventory add failed: ${r.status} ${await r.text()}`)
  
  return { previousLevel: currentLevel, newLevel, added: addQuantity }
}

async function publishIfNeeded(domain: string, token: string, productId: string) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Fetch product failed: ${r.status}`)
  
  if (b.product?.status !== 'active') {
    const ur = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { id: productId, status: 'active' } })
    })
    if (!ur.ok) throw new Error(`Publish failed: ${ur.status}`)
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
    const { storeKey, locationGid, item } = await req.json().catch(() => ({}))
    if (!storeKey || !locationGid || !item || !item.sku) {
      return json(400, { error: 'Expected { storeKey, locationGid, item: { sku, ... } }' })
    }

    console.info('send.start', { correlationId: run.correlationId, storeKey, locationGid, sku: item.sku, quantity: item.quantity })

    const { domain, token } = await loadStore(supabase, storeKey)
    const slug = deriveStoreSlug(domain)
    run.add({ name: 'loadStore', ok: true, data: { domain, slug } })

    const locationId = parseIdFromGid(locationGid)
    if (!locationId) return json(400, { ok: false, error: 'Invalid locationGid' })

    // A) GraphQL search by SKU first
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
    
    const { ok: gok, status: gstatus, body: gbody } = await shopifyGraphQL(domain, token, GQL, { q: `sku:${item.sku}` })
    run.add({ name: 'lookupBySku', ok: gok, status: gstatus, data: { count: gbody?.data?.productVariants?.nodes?.length || 0 } })
    const skuHits = gok ? (gbody?.data?.productVariants?.nodes || []) : []

    // B) Reuse existing variant if SKU matches
    let chosen: any = null
    if (skuHits.length) {
      // Pick first active if present, otherwise first match
      chosen = skuHits.find((n: any) => n?.product?.status === 'ACTIVE') || skuHits[0]
      run.add({ name: 'reuseVariant', ok: true, data: { reason: 'sku', variantGid: chosen.id, productGid: chosen.product.id } })
    }

    // C) Create new product if no SKU match
    let productId: string, variantId: string, inventoryItemId: string
    let resultMeta: any = {}
    
    if (!chosen) {
      const newProduct = await createRawProduct(domain, token, item)
      chosen = {
        id: `gid://shopify/ProductVariant/${newProduct?.variants?.[0]?.id}`,
        product: { id: `gid://shopify/Product/${newProduct?.id}`, status: newProduct?.status, tags: newProduct?.tags, title: newProduct?.title },
        sku: newProduct?.variants?.[0]?.sku,
        inventoryItem: { id: `gid://shopify/InventoryItem/${newProduct?.variants?.[0]?.inventory_item_id}` }
      }
      run.add({ name: 'createdNew', ok: true, data: { productId: newProduct?.id, variantId: newProduct?.variants?.[0]?.id, sku: item.sku } })
      
      resultMeta = {
        appliedTitle: newProduct?.title,
        appliedTags: newProduct?.tags,
        action: 'created_new_product'
      }
    } else {
      resultMeta = {
        action: 'reused_existing_sku'
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

    // Add inventory at selected location (key difference from graded cards)
    try {
      const inventoryResult = await addInventory(domain, token, inventoryItemId, String(locationId), Number(item.quantity || 1))
      run.add({ name: 'addInventory', ok: true, data: { 
        locationId, 
        addedQuantity: item.quantity || 1,
        previousLevel: inventoryResult.previousLevel,
        newLevel: inventoryResult.newLevel 
      } })
      resultMeta.inventoryChange = inventoryResult
    } catch (e: any) {
      run.add({ name: 'addInventory', ok: false, note: e?.message })
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
          input: { storeKey, sku: item.sku, quantity: item.quantity || 1, locationGid, locationId },
          store: { domain, slug },
          result: { productId, variantId, inventoryItemId },
          raw: {
            decision: skuHits.length ? 'reuse-sku' : 'created',
            skuMatches: skuHits.length
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
      decision: skuHits.length ? 'reuse-sku' : 'created',
      productAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}`,
      variantAdminUrl: `https://admin.shopify.com/store/${slug}/products/${productId}/variants/${variantId}`,
      resultMeta
    })
  } catch (e: any) {
    console.warn('send.fail', { correlationId: run.correlationId, message: e?.message })
    
    // Write partial snapshot on error
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.item?.id) {
        await supabase.from('intake_items').update({
          shopify_sync_status: 'error',
          last_shopify_sync_error: e?.message || 'Internal error',
          last_shopify_correlation_id: run.correlationId,
          shopify_sync_snapshot: {
            input: { storeKey: body?.storeKey, sku: body?.item?.sku, locationGid: body?.locationGid },
            raw: { decision: 'error' },
            steps: run.steps,
            error: e?.message || 'Internal error'
          },
        }).eq('id', body.item.id)
      }
    } catch (dbError) {
      console.warn('Failed to update item with error:', dbError)
    }
    
    return json(500, { ok: false, error: e?.message || 'Internal error', correlationId: run.correlationId })
  }
})