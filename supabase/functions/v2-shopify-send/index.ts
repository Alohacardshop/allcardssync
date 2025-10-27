import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'

interface SendArgs {
  storeKey: "hawaii" | "las_vegas"
  sku: string
  title?: string | null
  price?: number | null
  barcode?: string | null
  locationGid: string
  quantity: number
  intakeItemId?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Authenticate user and validate JWT
    const user = await requireAuth(req)
    
    // 2. Verify user has staff/admin role
    await requireRole(user.id, ['admin', 'staff'])
    // 3. Parse and validate input
    const { storeKey, sku, title, price, barcode, locationGid, quantity, intakeItemId }: SendArgs = await req.json()

    // 4. Verify user has access to this store/location
    await requireStoreAccess(user.id, storeKey, locationGid)
    
    // 5. Log audit trail
    console.log(`[AUDIT] User ${user.id} (${user.email}) triggered shopify-send for store ${storeKey}, SKU ${sku}`)

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get intake item data if provided
    let intakeItem = null
    if (intakeItemId) {
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('id', intakeItemId)
        .single()
      
      if (!error && data) {
        intakeItem = data
      }
    }

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Determine if this is a graded item and extract PSA URL
    const isGraded = intakeItem?.grade && intakeItem.grade !== '0'
    const psaUrl = intakeItem?.catalog_snapshot?.psaUrl || 
                   intakeItem?.psa_snapshot?.psaUrl || 
                   (intakeItem?.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    // Create appropriate title and description
    let finalTitle = title || 'Trading Card'
    let description = 'Trading Card'

    if (intakeItem) {
      if (isGraded) {
        const parts = [
          intakeItem.year,
          intakeItem.brand_title,
          intakeItem.subject,
          intakeItem.card_number,
          `PSA ${intakeItem.grade}`
        ].filter(Boolean)
        finalTitle = parts.join(' ')
        description = `Graded ${intakeItem.brand_title} ${intakeItem.subject}`
        if (intakeItem.year) description += ` from ${intakeItem.year}`
        if (intakeItem.grade) description += `, PSA Grade ${intakeItem.grade}`
        if (psaUrl) description += `\n\nPSA Certificate: ${psaUrl}`
      } else {
        const parts = [
          intakeItem.brand_title,
          intakeItem.subject,
          intakeItem.card_number
        ].filter(Boolean)
        if (parts.length > 0) finalTitle = parts.join(' ')
        description = `Raw ${intakeItem.brand_title} ${intakeItem.subject}`
      }
    }

    // Create Shopify product
    const productData = {
      product: {
        title: finalTitle,
        body_html: description,
        vendor: intakeItem?.brand_title || 'Trading Cards',
        product_type: isGraded ? 'Graded Card' : 'Raw Card',
        tags: isGraded 
          ? ['PSA', `Grade ${intakeItem.grade}`, intakeItem?.brand_title, intakeItem?.year].filter(Boolean).join(', ')
          : ['Raw Card', intakeItem?.brand_title].filter(Boolean).join(', '),
        variants: [{
          sku: sku,
          price: price?.toString() || '0.00',
          inventory_quantity: quantity,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: barcode || intakeItem?.psa_cert || '',
          inventory_policy: 'deny'
        }],
        images: intakeItem?.catalog_snapshot?.imageUrl ? [{
          src: intakeItem.catalog_snapshot.imageUrl,
          alt: finalTitle
        }] : []
      }
    }

    const createResponse = await fetch(`https://${domain}/admin/api/2024-07/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productData)
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Failed to create Shopify product: ${errorText}`)
    }

    const result = await createResponse.json()
    const product = result.product
    const variant = product.variants[0]

    // Set inventory level at location
    const locationId = locationGid.replace('gid://shopify/Location/', '')
    
    const inventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: quantity
      })
    })

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text()
      console.warn(`Failed to set inventory level: ${errorText}`)
    }

    // Update intake item with Shopify IDs if provided
    if (intakeItemId) {
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          shopify_product_id: product.id.toString(),
          shopify_variant_id: variant.id.toString(),
          shopify_inventory_item_id: variant.inventory_item_id.toString(),
          last_shopify_synced_at: new Date().toISOString(),
          shopify_sync_status: 'synced',
          pushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', intakeItemId)

      if (updateError) {
        console.error('Failed to update intake item:', updateError)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      product_url: `https://${domain}/products/${product.handle}`,
      admin_url: `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/products/${product.id}`,
      psa_url_included: !!psaUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in v2-shopify-send:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})