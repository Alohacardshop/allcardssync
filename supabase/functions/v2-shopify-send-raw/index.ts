import { corsHeaders } from '../_shared/cors.ts'

interface SendRawArgs {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku: string
    brand_title?: string
    subject?: string
    card_number?: string
    image_url?: string
    cost?: number
    title?: string
    price?: number
    barcode?: string
    condition?: string
    quantity?: number
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { storeKey, locationGid, item }: SendRawArgs = await req.json()

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Create raw card title
    const brandTitle = item.brand_title || ''
    const subject = item.subject || ''
    const cardNumber = item.card_number || ''
    const condition = item.condition || 'NM'

    let title = item.title
    if (!title) {
      const parts = [brandTitle, subject, cardNumber, condition].filter(Boolean)
      title = parts.join(' ')
    }

    // Create product description
    let description = `Raw ${brandTitle} ${subject}`
    if (cardNumber) description += ` #${cardNumber}`
    if (condition) description += ` - ${condition} Condition`

    // Create Shopify product
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: brandTitle || 'Trading Cards',
        product_type: 'Raw Card',
        tags: ['Raw Card', brandTitle, condition].filter(Boolean).join(', '),
        variants: [{
          sku: item.sku,
          price: item.price?.toString() || '0.00',
          inventory_quantity: item.quantity || 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: item.barcode || '',
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

    // Update intake item with Shopify IDs if provided
    if (item.id) {
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
    }

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      product_url: `https://${domain}/products/${product.handle}`,
      admin_url: `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/products/${product.id}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in v2-shopify-send-raw:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})