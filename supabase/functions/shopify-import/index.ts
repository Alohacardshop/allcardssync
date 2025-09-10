// Shopify importer (SKU-first, idempotent)
// - Reuse existing active variant by SKU or create single-variant product (status: active)
// - Write product/variant/inventory_item IDs back to intake_items
// - Do NOT set inventory here; if request includes locationGid, call existing shopify-sync-inventory
// Request body:
// {
//   items: [{ id, sku, title?, description?, price?, barcode? }],
//   storeKey: "hawaii" | "las_vegas",
//   locationGid?: "gid://shopify/Location/#########"
// }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

type ItemRow = {
  id: string
  sku: string
  title?: string | null
  description?: string | null
  price?: number | null
  barcode?: string | null
}

const API_VER = '2024-07'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchWithRetry(input: RequestInfo, init?: RequestInit, tries = 3) {
  let lastErr: unknown = null
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(input, init)
      if (res.ok || (res.status >= 400 && res.status < 500)) return res
      lastErr = new Error(`Bad status ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    await new Promise(r => setTimeout(r, 250 * (i + 1)))
  }
  throw lastErr
}

function up(s: string) { return (s || '').toUpperCase() }

async function loadStoreConfig(supabase: any, storeKey: string) {
  const U = up(storeKey)
  const keys = [
    `SHOPIFY_${U}_STORE_DOMAIN`,
    `SHOPIFY_${U}_ACCESS_TOKEN`,
  ]
  const { data, error } = await supabase
    .from('system_settings')
    .select('key_name, key_value')
    .in('key_name', keys)
  if (error) throw new Error(`Failed to load store config: ${error.message}`)
  const map = new Map<string, string>()
  for (const row of data ?? []) map.set(row.key_name, row.key_value)
  const domain = map.get(`SHOPIFY_${U}_STORE_DOMAIN`) || ''
  const token  = map.get(`SHOPIFY_${U}_ACCESS_TOKEN`) || ''
  if (!domain || !token) throw new Error(`Missing Shopify credentials for storeKey=${storeKey}`)
  return { domain, token }
}

async function findVariantsBySKU(domain: string, token: string, sku: string) {
  const url = `https://${domain}/admin/api/${API_VER}/variants.json?sku=${encodeURIComponent(sku)}&limit=50`
  const res = await fetchWithRetry(url, { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }})
  if (!res.ok) throw new Error(`Variant lookup failed: ${res.status}`)
  const body = await res.json()
  return (body.variants as any[]) || []
}

async function fetchProduct(domain: string, token: string, productId: string) {
  const res = await fetchWithRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Fetch product failed: ${res.status}`)
  return body.product
}

async function publishProductIfNeeded(domain: string, token: string, productId: string) {
  const product = await fetchProduct(domain, token, productId)
  if (product?.status !== 'active') {
    const up = await fetchWithRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { id: productId, status: 'active' } }),
    })
    if (!up.ok) throw new Error(`Publish failed: ${up.status}`)
  }
}

async function createSingleVariantProduct(domain: string, token: string, item: ItemRow) {
  const payload = {
    product: {
      title: item.title || item.sku,
      body_html: item.description || undefined,
      status: 'active',
      variants: [
        {
          sku: item.sku,
          price: item.price != null ? Number(item.price).toFixed(2) : undefined,
          barcode: item.barcode || undefined,
          inventory_management: 'shopify',
        },
      ],
    },
  }
  const res = await fetchWithRetry(`https://${domain}/admin/api/${API_VER}/products.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Create product failed: ${res.status} ${JSON.stringify(body)}`)
  return body.product
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
  )

  try {
    const { items, storeKey, locationGid } = await req.json().catch(() => ({}))
    if (!Array.isArray(items) || !storeKey) {
      return json(400, { error: 'Invalid payload. Expect { items: ItemRow[], storeKey, locationGid? }' })
    }

    const { domain, token } = await loadStoreConfig(supabase, storeKey)
    const results: any[] = []

    for (const raw of items as ItemRow[]) {
      const ctx = { id: raw?.id, sku: raw?.sku }
      try {
        if (!raw?.sku) throw new Error('Item missing SKU')

        const found = await findVariantsBySKU(domain, token, raw.sku)

        let productId: string
        let variantId: string
        let inventoryItemId: string

        if (found.length > 0) {
          const candidate = found.find(v => v?.product?.status === 'active') || found[0]
          productId = String(candidate.product_id)
          variantId = String(candidate.id)
          inventoryItemId = String(candidate.inventory_item_id)
          await publishProductIfNeeded(domain, token, productId)
        } else {
          const product = await createSingleVariantProduct(domain, token, raw)
          productId = String(product.id)
          variantId = String(product.variants?.[0]?.id)
          inventoryItemId = String(product.variants?.[0]?.inventory_item_id)
        }

        // Write back IDs
        await supabase
          .from('intake_items')
          .update({
            shopify_product_id: productId,
            shopify_variant_id: variantId,
            shopify_inventory_item_id: inventoryItemId,
            pushed_at: new Date().toISOString(),
          })
          .eq('id', raw.id)

        // If a locationGid was provided, chain to existing sync to maintain current per-location semantics
        if (locationGid) {
          await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/shopify-sync-inventory`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.get('Authorization') || '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ storeKey, sku: raw.sku, locationGid })
          })
        }

        results.push({ ...ctx, ok: true, productId, variantId, inventoryItemId })
      } catch (e: any) {
        console.error('shopify-import item error', { ...ctx, error: e?.message })
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: e?.message || 'import failed',
          })
          .eq('id', raw.id)
        results.push({ ...ctx, ok: false, error: e?.message || String(e) })
      }
    }

    return json(200, { ok: true, results })
  } catch (e: any) {
    console.error('shopify-import fatal', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})