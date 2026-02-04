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

export async function shopifyGraphQL(domain: string, token: string, query: string, variables?: any) {
  const r = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  const body = await r.json()
  return { ok: r.ok, status: r.status, body }
}

export function onlyDigits(s?: string | null) { 
  return (s || '').replace(/\D+/g, '') 
}

export function parseNumericIdFromGid(gid?: string | null) { 
  const m = String(gid || '').match(/\/(\d+)$/)
  return m ? m[1] : null
}

export async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchRetry(i: RequestInfo, init?: RequestInit, tries = 5) {
  let last: any
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(i, init)
      
      // Success case
      if (r.ok) return r
      
      // Rate limit (429) - always retry with exponential backoff
      if (r.status === 429) {
        const retryAfter = r.headers.get('Retry-After')
        let delay = Math.pow(2, t) * 1000 // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        
        // Use Retry-After header if provided (in seconds)
        if (retryAfter) {
          delay = Math.max(delay, parseInt(retryAfter) * 1000)
        }
        
        console.warn(`Rate limited (429), retrying in ${delay}ms (attempt ${t + 1}/${tries})`)
        last = new Error(`HTTP 429 - Rate Limited`)
        await sleep(delay)
        continue
      }
      
      // Server errors (5xx) - retry with exponential backoff
      if (r.status >= 500) {
        const delay = Math.pow(2, t) * 500 // 0.5s, 1s, 2s, 4s, 8s
        console.warn(`Server error ${r.status}, retrying in ${delay}ms (attempt ${t + 1}/${tries})`)
        last = new Error(`HTTP ${r.status}`)
        await sleep(delay)
        continue
      }
      
      // Client errors (4xx except 429) - don't retry
      if (r.status >= 400 && r.status < 500) {
        return r
      }
      
      last = new Error(`HTTP ${r.status}`)
    } catch (e) {
      last = e
      // Network errors - retry with exponential backoff
      const delay = Math.pow(2, t) * 500
      console.warn(`Network error, retrying in ${delay}ms (attempt ${t + 1}/${tries}):`, e.message)
    }
    
    // Default delay for other retry cases
    await sleep(Math.pow(2, t) * 500)
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

/**
 * DEPRECATED: Use adjustInventorySafe or setInventorySafe for concurrency-safe updates
 * This function remains for backwards compatibility but does NOT check for stale data
 */
export async function setInventory(domain: string, token: string, inventory_item_id: string, location_id: string, available: number) {
  const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory_item_id, location_id, available })
  })
  if (!r.ok) throw new Error(`Inventory set failed: ${r.status} ${await r.text()}`)
}

/**
 * Fetch current Shopify inventory level for an item at a location
 */
export async function getInventoryLevel(
  domain: string, 
  token: string, 
  inventory_item_id: string, 
  location_id: string
): Promise<{ available: number; updated_at: string } | null> {
  try {
    const r = await fetchRetry(
      `https://${domain}/admin/api/${API_VER}/inventory_levels.json?inventory_item_ids=${inventory_item_id}&location_ids=${location_id}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
    if (!r.ok) return null
    
    const data = await r.json()
    const level = data.inventory_levels?.[0]
    if (!level) return null
    
    return {
      available: level.available ?? 0,
      updated_at: level.updated_at || new Date().toISOString()
    }
  } catch {
    return null
  }
}

export interface SafeInventoryResult {
  success: boolean
  previous_available?: number
  new_available?: number
  error?: string
  stale?: boolean
}

/**
 * Safe inventory adjustment using delta (increment/decrement)
 * - Fetches current level before adjusting
 * - Optionally validates against expected_available (optimistic locking)
 * - Prevents negative inventory
 */
export async function adjustInventorySafe(
  domain: string,
  token: string,
  inventory_item_id: string,
  location_id: string,
  delta: number,
  expected_available?: number
): Promise<SafeInventoryResult> {
  // Step 1: Fetch current level
  const current = await getInventoryLevel(domain, token, inventory_item_id, location_id)
  if (!current) {
    return { success: false, error: 'Failed to fetch current inventory level' }
  }
  
  // Step 2: Optimistic locking check
  if (typeof expected_available === 'number' && expected_available !== current.available) {
    return {
      success: false,
      error: 'STALE_DATA',
      stale: true,
      previous_available: current.available
    }
  }
  
  // Step 3: Prevent negative inventory
  const newAvailable = current.available + delta
  if (newAvailable < 0) {
    return {
      success: false,
      error: `INSUFFICIENT_INVENTORY: have ${current.available}, attempted delta ${delta}`,
      previous_available: current.available
    }
  }
  
  // Step 4: Apply adjustment
  try {
    const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/adjust.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id,
        inventory_item_id,
        available_adjustment: delta
      })
    })
    
    if (!r.ok) {
      const text = await r.text()
      return { success: false, error: `Adjust failed: ${r.status} ${text}` }
    }
    
    const result = await r.json()
    return {
      success: true,
      previous_available: current.available,
      new_available: result.inventory_level?.available ?? newAvailable
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/**
 * Safe inventory set (absolute value) with optimistic locking
 * - Fetches current level before setting
 * - Validates against expected_available to prevent overwriting POS changes
 */
export async function setInventorySafe(
  domain: string,
  token: string,
  inventory_item_id: string,
  location_id: string,
  new_available: number,
  expected_available?: number
): Promise<SafeInventoryResult> {
  // Step 1: Fetch current level
  const current = await getInventoryLevel(domain, token, inventory_item_id, location_id)
  if (!current) {
    return { success: false, error: 'Failed to fetch current inventory level' }
  }
  
  // Step 2: Optimistic locking check
  if (typeof expected_available === 'number' && expected_available !== current.available) {
    return {
      success: false,
      error: 'STALE_DATA',
      stale: true,
      previous_available: current.available
    }
  }
  
  // Step 3: Apply set
  try {
    const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id,
        inventory_item_id,
        available: new_available
      })
    })
    
    if (!r.ok) {
      const text = await r.text()
      return { success: false, error: `Set failed: ${r.status} ${text}` }
    }
    
    const result = await r.json()
    return {
      success: true,
      previous_available: current.available,
      new_available: result.inventory_level?.available ?? new_available
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}