import { corsHeaders } from '../_shared/cors.ts'

interface SendGradedArgs {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku?: string
    psa_cert?: string
    barcode?: string
    title?: string
    price?: number
    grade?: string
    quantity?: number
    year?: string
    brand_title?: string
    subject?: string
    card_number?: string
    variant?: string
    category_tag?: string
    image_url?: string
    cost?: number
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { storeKey, locationGid, item }: SendGradedArgs = await req.json()

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the intake item with PSA data
    const { data: intakeItem, error: fetchError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', item.id)
      .single()

    if (fetchError || !intakeItem) {
      throw new Error(`Failed to fetch intake item: ${fetchError?.message}`)
    }

    // Extract PSA URL from catalog_snapshot or psa_snapshot
    const psaUrl = intakeItem.catalog_snapshot?.psaUrl || 
                   intakeItem.psa_snapshot?.psaUrl || 
                   (intakeItem.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Create graded card title with year
    const year = item.year || intakeItem.year || ''
    const brandTitle = item.brand_title || intakeItem.brand_title || ''
    const subject = item.subject || intakeItem.subject || ''
    const grade = item.grade || intakeItem.grade || ''
    const cardNumber = item.card_number || intakeItem.card_number || ''

    let title = item.title
    if (!title) {
      const parts = [year, brandTitle, subject, cardNumber, `PSA ${grade}`].filter(Boolean)
      title = parts.join(' ')
    }

    // Create product description with PSA URL
    let description = `Graded ${brandTitle} ${subject}`
    if (year) description += ` from ${year}`
    if (grade) description += `, PSA Grade ${grade}`
    if (psaUrl) description += `\n\nPSA Certificate: ${psaUrl}`

    // Create Shopify product
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: brandTitle || 'Trading Cards',
        product_type: 'Graded Card',
        tags: ['PSA', `Grade ${grade}`, brandTitle, year].filter(Boolean).join(', '),
        variants: [{
          sku: item.sku,
          price: item.price?.toString() || '0.00',
          inventory_quantity: item.quantity || 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: item.barcode || item.psa_cert || '',
          inventory_policy: 'deny'
        }],
        images: item.image_url ? [{
          src: item.image_url,
          alt: title
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
        available: item.quantity || 1
      })
    })

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text()
      console.warn(`Failed to set inventory level: ${errorText}`)
    }

    // Update intake item with Shopify IDs
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
      .eq('id', item.id)

    if (updateError) {
      console.error('Failed to update intake item:', updateError)
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
    console.error('Error in v2-shopify-send-graded:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})