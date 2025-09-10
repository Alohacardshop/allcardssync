// Shared Shopify utilities for edge functions
export const API_VER = '2024-07'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export function up(s: string) { return (s || '').toUpperCase() }
export const deriveStoreSlug = (domain: string) => (domain || '').split('.')[0]

// Simple run context to collect step logs for the snapshot
export type Step = { name: string, ok: boolean, status?: number | null, note?: string | null, data?: any }
export function newRun() { 
  const correlationId = crypto.randomUUID()
  const steps: Step[] = []
  const add = (s: Step) => { steps.push(s); return s }
  return { correlationId, steps, add }
}

export function parseIdFromGid(gid?: string | null) {
  if (!gid) return null
  const m = String(gid).match(/\/(\d+)$/)
  return m ? m[1] : null
}

export async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchRetry(i: RequestInfo, init?: RequestInit, tries = 3) {
  let last: any
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(i, init)
      if (r.ok || (r.status >= 400 && r.status < 500)) return r
      last = new Error(`HTTP ${r.status}`)
    } catch (e) {
      last = e
    }
    await sleep(200 * (t + 1))
  }
  throw last
}

export async function loadStore(supabase: any, storeKey: string) {
  const U = up(storeKey)
  const { data, error } = await supabase.from('system_settings').select('key_name,key_value')
    .in('key_name', [`SHOPIFY_${U}_STORE_DOMAIN`, `SHOPIFY_${U}_ACCESS_TOKEN`])
  if (error) throw new Error(error.message)
  const m = new Map<string, string>()
  for (const row of data ?? []) m.set(row.key_name, row.key_value)
  const domain = m.get(`SHOPIFY_${U}_STORE_DOMAIN`) || ''
  const token = m.get(`SHOPIFY_${U}_ACCESS_TOKEN`) || ''
  if (!domain || !token) throw new Error(`Missing Shopify creds for ${storeKey}`)
  return { domain, token }
}

export async function findVariantsBySKU(domain: string, token: string, sku: string) {
  const u = `https://${domain}/admin/api/${API_VER}/variants.json?sku=${encodeURIComponent(sku)}&limit=50`
  const r = await fetchRetry(u, { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } })
  const b = await r.json()
  return (b.variants as any[]) || []
}

export async function getProduct(domain: string, token: string, id: string) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${id}.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`Fetch product failed: ${r.status}`)
  return b.product
}

export async function publishIfNeeded(domain: string, token: string, productId: string) {
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

export async function setInventory(domain: string, token: string, inventory_item_id: string, location_id: string, available: number) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory_item_id, location_id, available })
  })
  if (!r.ok) throw new Error(`Inventory set failed: ${r.status} ${await r.text()}`)
}