// Graded card sender for Shopify (PSA certs, unique single-variant products)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { API_VER, loadStore, findVariantsBySKU, publishIfNeeded, setInventory, parseIdFromGid, fetchRetry } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

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
  
  try {
    const { storeKey, locationGid, item } = await req.json().catch(() => ({}))
    if (!storeKey || !locationGid || !item) {
      return json(400, { error: 'Expected { storeKey, locationGid, item }' })
    }

    const { domain, token } = await loadStore(supabase, storeKey)

    // Determine SKU and barcode for graded item
    let sku: string, barcode: string
    if (item.psa_cert) {
      sku = barcode = item.psa_cert
    } else {
      // Fallback for non-PSA graded items
      const last8 = item.id?.slice(-8) || 'unknown'
      sku = barcode = `GRADED${item.grade?.replace(/\s+/g, '')}-${last8}`
    }

    // Build tags
    const baseTags = [item.category, item.variant, item.lot_number ? `lot-${item.lot_number}` : null, 'intake', item.game]
    const gradedTags = ['graded']
    if (item.psa_cert) gradedTags.push('PSA')
    const gradeNum = extractGradeNumber(item.grade)
    if (gradeNum) gradedTags.push(`grade-${gradeNum}`)
    
    const allTags = [...baseTags.filter(Boolean), ...gradedTags]

    // Find or create variant
    const matches = await findVariantsBySKU(domain, token, sku)
    let productId: string, variantId: string, inventoryItemId: string

    if (matches.length) {
      const v = matches.find((x: any) => x?.product?.status === 'active') || matches[0]
      productId = String(v.product_id)
      variantId = String(v.id)
      inventoryItemId = String(v.inventory_item_id)
      await publishIfNeeded(domain, token, productId)
    } else {
      const p = await createGradedProduct(domain, token, sku, barcode, item.title, item.price, allTags)
      productId = String(p.id)
      variantId = String(p.variants?.[0]?.id)
      inventoryItemId = String(p.variants?.[0]?.inventory_item_id)
    }

    // Set inventory at selected location
    const locationId = parseIdFromGid(locationGid)
    if (!locationId) throw new Error('Invalid locationGid')
    await setInventory(domain, token, inventoryItemId, String(locationId), Number(item.quantity || 1))

    // Write back IDs to intake_items
    if (item.id) {
      await supabase.from('intake_items').update({
        shopify_product_id: productId,
        shopify_variant_id: variantId,
        shopify_inventory_item_id: inventoryItemId,
        pushed_at: new Date().toISOString(),
      }).eq('id', item.id)
    }

    return json(200, { ok: true, productId, variantId, inventoryItemId })
  } catch (e: any) {
    console.error('v2-shopify-send-graded', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})