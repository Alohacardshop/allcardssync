import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Auth + role check
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    const { item_id } = await req.json()
    if (!item_id) {
      return new Response(JSON.stringify({ success: false, error: 'item_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Fetch intake item
    const { data: item, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, sku, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, store_key')
      .eq('id', item_id)
      .single()

    if (fetchError || !item) {
      console.error(JSON.stringify({ event: 'repair_linkage_item_not_found', item_id }))
      return new Response(JSON.stringify({ success: false, error: `Item not found: ${fetchError?.message}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Validate preconditions
    if (!item.shopify_product_id) {
      console.error(JSON.stringify({ event: 'repair_linkage_no_product_id', item_id }))
      return new Response(JSON.stringify({ success: false, error: 'No shopify_product_id — nothing to repair' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!item.sku) {
      console.error(JSON.stringify({ event: 'repair_linkage_no_sku', item_id }))
      return new Response(JSON.stringify({ success: false, error: 'No SKU on item — cannot match variant' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if repair is actually needed
    if (item.shopify_variant_id && item.shopify_inventory_item_id) {
      console.log(JSON.stringify({ event: 'repair_linkage_not_needed', item_id, shopify_product_id: item.shopify_product_id }))
      return new Response(JSON.stringify({
        success: true,
        message: 'Linkage already complete — no repair needed',
        shopify_product_id: item.shopify_product_id,
        shopify_variant_id: item.shopify_variant_id,
        shopify_inventory_item_id: item.shopify_inventory_item_id
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(JSON.stringify({
      event: 'repair_linkage_start',
      item_id,
      sku: item.sku,
      shopify_product_id: item.shopify_product_id,
      missing_variant: !item.shopify_variant_id,
      missing_inventory_item: !item.shopify_inventory_item_id,
      triggered_by: user.id
    }))

    // 4. Get Shopify credentials
    const storeKey = item.store_key || 'default'
    const storeUpper = storeKey.toUpperCase()

    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])

    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value

    if (!domain || !token) {
      return new Response(JSON.stringify({ success: false, error: `Missing Shopify credentials for store ${storeKey}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 5. Fetch product from Shopify
    const shopifyRes = await fetch(
      `https://${domain}/admin/api/2024-07/products/${item.shopify_product_id}.json`,
      { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
    )

    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text()
      console.error(JSON.stringify({ event: 'repair_linkage_shopify_fetch_failed', item_id, status: shopifyRes.status, error: errText }))
      return new Response(JSON.stringify({ success: false, error: `Shopify GET failed (${shopifyRes.status}): ${errText}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { product } = await shopifyRes.json()
    if (!product?.variants?.length) {
      console.error(JSON.stringify({ event: 'repair_linkage_no_variants', item_id, shopify_product_id: item.shopify_product_id }))
      return new Response(JSON.stringify({ success: false, error: 'Shopify product has no variants' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 6. Match variant by SKU
    const matchedVariant = product.variants.find((v: any) => v.sku === item.sku)

    if (!matchedVariant) {
      console.error(JSON.stringify({
        event: 'repair_linkage_sku_mismatch',
        item_id,
        expected_sku: item.sku,
        available_skus: product.variants.map((v: any) => v.sku)
      }))
      return new Response(JSON.stringify({
        success: false,
        error: `No variant with SKU "${item.sku}" found on Shopify product ${item.shopify_product_id}`,
        available_skus: product.variants.map((v: any) => v.sku)
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const repairedVariantId = matchedVariant.id.toString()
    const repairedInventoryItemId = matchedVariant.inventory_item_id.toString()

    // 7. Update intake_items
    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        shopify_variant_id: repairedVariantId,
        shopify_inventory_item_id: repairedInventoryItemId,
        updated_at: new Date().toISOString(),
        updated_by: 'repair-shopify-linkage'
      })
      .eq('id', item_id)

    if (updateError) {
      console.error(JSON.stringify({ event: 'repair_linkage_update_failed', item_id, error: updateError.message }))
      return new Response(JSON.stringify({ success: false, error: `DB update failed: ${updateError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(JSON.stringify({
      event: 'shopify_linkage_repaired',
      item_id,
      sku: item.sku,
      shopify_product_id: item.shopify_product_id,
      shopify_variant_id: repairedVariantId,
      shopify_inventory_item_id: repairedInventoryItemId,
      triggered_by: user.id
    }))

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: item.shopify_product_id,
      shopify_variant_id: repairedVariantId,
      shopify_inventory_item_id: repairedInventoryItemId
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error(JSON.stringify({ event: 'repair_linkage_error', error: error.message }))
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
