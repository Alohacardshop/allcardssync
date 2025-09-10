import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
  )

  try {
    const { storeKey, sku } = await req.json().catch(() => ({}))
    if (!storeKey || !sku) {
      return json(400, { error: 'Invalid payload. Expect { storeKey, sku }' })
    }

    const { domain, token } = await loadStoreConfig(supabase, storeKey)
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

    // Get all variants for this SKU
    const variantRes = await fetchWithRetry(
      `https://${domain}/admin/api/${API_VER}/variants.json?sku=${encodeURIComponent(sku)}&limit=50`,
      { headers }
    )
    const variantData = await variantRes.json()
    const variants = variantData.variants || []

    if (variants.length === 0) {
      return json(200, { results: [] })
    }

    // Get locations once
    const locationRes = await fetchWithRetry(
      `https://${domain}/admin/api/${API_VER}/locations.json`,
      { headers }
    )
    const locationData = await locationRes.json()
    const locations = locationData.locations || []
    const locationMap = new Map(locations.map((loc: any) => [String(loc.id), loc.name]))

    const results = []

    for (const variant of variants) {
      try {
        // Get product details
        const productRes = await fetchWithRetry(
          `https://${domain}/admin/api/${API_VER}/products/${variant.product_id}.json`,
          { headers }
        )
        const productData = await productRes.json()
        const product = productData.product

        // Get inventory levels for this variant
        const inventoryRes = await fetchWithRetry(
          `https://${domain}/admin/api/${API_VER}/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`,
          { headers }
        )
        const inventoryData = await inventoryRes.json()
        const inventoryLevels = inventoryData.inventory_levels || []

        const inventory = inventoryLevels.map((level: any) => ({
          locationGid: `gid://shopify/Location/${level.location_id}`,
          locationId: String(level.location_id),
          locationName: locationMap.get(String(level.location_id)) || `Location ${level.location_id}`,
          available: level.available || 0
        }))

        results.push({
          productId: String(variant.product_id),
          variantId: String(variant.id),
          inventoryItemId: String(variant.inventory_item_id),
          title: product.title,
          status: product.status,
          published: product.published_at !== null,
          inventory
        })
      } catch (error: any) {
        console.error(`Error processing variant ${variant.id}:`, error)
        // Continue with other variants
      }
    }

    return json(200, { results })
  } catch (e: any) {
    console.error('shopify-inspect error:', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})