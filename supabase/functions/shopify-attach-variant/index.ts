import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
  )

  try {
    const { intakeItemId, productId, variantId, inventoryItemId } = await req.json().catch(() => ({}))
    if (!intakeItemId || !productId || !variantId || !inventoryItemId) {
      return json(400, { error: 'Invalid payload. Expect { intakeItemId, productId, variantId, inventoryItemId }' })
    }

    // Update intake_items with Shopify IDs
    const { error } = await supabase
      .from('intake_items')
      .update({
        shopify_product_id: productId,
        shopify_variant_id: variantId,
        shopify_inventory_item_id: inventoryItemId,
        pushed_at: new Date().toISOString(),
        shopify_sync_status: 'synced',
        last_shopify_sync_error: null
      })
      .eq('id', intakeItemId)

    if (error) throw error

    return json(200, { ok: true, message: 'Variant attached successfully' })
  } catch (e: any) {
    console.error('shopify-attach-variant error:', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})