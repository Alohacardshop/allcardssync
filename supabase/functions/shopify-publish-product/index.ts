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
    const { storeKey, productId } = await req.json().catch(() => ({}))
    if (!storeKey || !productId) {
      return json(400, { error: 'Invalid payload. Expect { storeKey, productId }' })
    }

    const { domain, token } = await loadStoreConfig(supabase, storeKey)

    // Publish the product by setting status to 'active'
    const res = await fetchWithRetry(
      `https://${domain}/admin/api/${API_VER}/products/${productId}.json`,
      {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            id: productId,
            status: 'active'
          }
        })
      }
    )

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(`Publish failed: ${res.status} ${JSON.stringify(errorData)}`)
    }

    return json(200, { ok: true, message: 'Product published successfully' })
  } catch (e: any) {
    console.error('shopify-publish-product error:', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})