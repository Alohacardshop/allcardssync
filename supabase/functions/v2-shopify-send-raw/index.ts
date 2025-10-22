import { corsHeaders } from '../_shared/cors.ts'

interface SendRawArgs {
  item_id: string
  vendor?: string
}

// Helper function to generate barcode: TCGPlayerID-Condition
function generateBarcodeForRawCard(item: any): string {
  const tcgplayerId = item.catalog_snapshot?.tcgplayer_id || item.sku;
  const condition = item.variant || item.grade || 'NM';
  
  // Abbreviate condition for barcode
  const conditionAbbrev = condition.toLowerCase().includes('near mint') || condition === 'NM' ? 'NM' 
    : condition.toLowerCase().includes('lightly played') || condition === 'LP' ? 'LP'
    : condition.toLowerCase().includes('moderately played') || condition === 'MP' ? 'MP'
    : condition.toLowerCase().includes('heavily played') || condition === 'HP' ? 'HP'
    : condition.toLowerCase().includes('damaged') || condition === 'DMG' ? 'DMG'
    : 'NM';
  
  return `${tcgplayerId}-${conditionAbbrev}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { item_id, vendor }: SendRawArgs = await req.json()

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get intake item data
    const { data: intakeItem, error: fetchError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', item_id)
      .single()
    
    if (fetchError || !intakeItem) {
      throw new Error(`Failed to fetch intake item: ${fetchError?.message || 'Item not found'}`)
    }

    // Extract image URL from various sources
    const imageUrl = intakeItem.catalog_snapshot?.photo_url || 
                     intakeItem.catalog_snapshot?.image_url || 
                     intakeItem.psa_snapshot?.image_url ||
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) ? intakeItem.image_urls[0] : null) ||
                     (intakeItem.catalog_snapshot?.image_urls && Array.isArray(intakeItem.catalog_snapshot.image_urls) ? intakeItem.catalog_snapshot.image_urls[0] : null)

    // Get Shopify credentials
    const storeKey = intakeItem.store_key
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Create raw card title
    const brandTitle = intakeItem.brand_title || ''
    const subject = intakeItem.subject || ''
    const cardNumber = intakeItem.card_number || ''
    const condition = intakeItem.variant || 'NM'

    const parts = [brandTitle, subject, cardNumber, condition].filter(Boolean)
    const title = parts.join(' ')

    // Create product description with title and SKU
    let description = title
    if (intakeItem.sku) description += `\nSKU: ${intakeItem.sku}`
    
    // Add detailed description
    description += `\n\nRaw ${brandTitle} ${subject}`
    if (cardNumber) description += ` #${cardNumber}`
    if (condition) description += ` - ${condition} Condition`

    // Check for existing products with the same SKU first
    const existingResponse = await fetch(`https://${domain}/admin/api/2024-07/products.json?fields=id,variants&limit=250`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    })

    let existingProduct = null
    if (existingResponse.ok) {
      const existingData = await existingResponse.json()
      for (const product of existingData.products) {
        const existingVariant = product.variants.find(v => v.sku === intakeItem.sku)
        if (existingVariant) {
          existingProduct = { product, variant: existingVariant }
          break
        }
      }
    }

    // If SKU exists, update quantity instead of creating new product
    if (existingProduct && intakeItem.sku) {
      const { product, variant } = existingProduct
      const locationId = intakeItem.shopify_location_gid.replace('gid://shopify/Location/', '')
      
      // Get current inventory level
      const inventoryLevelResponse = await fetch(
        `https://${domain}/admin/api/2024-07/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}&location_ids=${locationId}`,
        {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          }
        }
      )

      let currentQuantity = 0
      if (inventoryLevelResponse.ok) {
        const inventoryData = await inventoryLevelResponse.json()
        if (inventoryData.inventory_levels && inventoryData.inventory_levels.length > 0) {
          currentQuantity = inventoryData.inventory_levels[0].available || 0
        }
      }

      const newQuantity = currentQuantity + (intakeItem.quantity || 1)
      
      // Update inventory level
      const updateInventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: newQuantity
        })
      })

      if (!updateInventoryResponse.ok) {
        const errorText = await updateInventoryResponse.text()
        throw new Error(`Failed to update inventory level: ${errorText}`)
      }

      // Create shopify snapshot with adjustment data
      const shopifySnapshot = {
        action: 'quantity_adjusted',
        existing_product_id: product.id,
        old_quantity: currentQuantity,
        new_quantity: newQuantity,
        sync_timestamp: new Date().toISOString(),
        graded: false
      }

      // Update intake item
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          shopify_product_id: product.id.toString(),
          shopify_variant_id: variant.id.toString(),
          shopify_inventory_item_id: variant.inventory_item_id.toString(),
          last_shopify_synced_at: new Date().toISOString(),
          shopify_sync_status: 'synced',
          pushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          shopify_sync_snapshot: shopifySnapshot,
          updated_by: 'shopify_sync'
        })
        .eq('id', item_id)

      if (updateError) {
        throw new Error(`Failed to update intake item: ${updateError.message}`)
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'quantity_adjusted',
        shopify_product_id: product.id.toString(),
        shopify_variant_id: variant.id.toString(),
        old_quantity: currentQuantity,
        new_quantity: newQuantity,
        message: `SKU ${intakeItem.sku} already exists. Quantity adjusted from ${currentQuantity} to ${newQuantity}`,
        product_url: `https://${domain}/products/${product.handle}`,
        admin_url: `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/products/${product.id}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if this is a comic
    const isComic = intakeItem.main_category === 'comics' || 
                    intakeItem.catalog_snapshot?.type === 'raw_comic'

    // Create Shopify product (new SKU)
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: vendor || brandTitle || (isComic ? 'Comics' : 'Trading Cards'),
        product_type: isComic ? 'Raw Comic' : 'Raw Card',
        tags: isComic ? [
          'comics',
          'raw',
          brandTitle, // Publisher (DC, Marvel, etc.)
          condition,
          intakeItem.sub_category || 'american', // Comic sub-category
          intakeItem.lot_number || 'Unknown Lot',
          subject ? `Title: ${subject}` : null,
          cardNumber ? `Issue: ${cardNumber}` : null,
          vendor
        ].filter(Boolean) : [
          'Raw Card',
          'single', 
          brandTitle, 
          condition, // Condition as separate tag
          intakeItem.category || 'Pokemon', // Game from intake item
          intakeItem.lot_number || 'Unknown Lot', // Lot number
          subject ? `Card: ${subject}` : null, // Card name
          cardNumber ? `Number: ${cardNumber}` : null, // Card number
          vendor // Add vendor to tags
        ].filter(Boolean),
        variants: [{
          sku: intakeItem.sku,
          price: intakeItem.price?.toString() || '0.00',
          inventory_quantity: intakeItem.quantity || 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: generateBarcodeForRawCard(intakeItem), // TCGPlayerID-Condition format
          inventory_policy: 'deny'
        }],
        images: imageUrl ? [{
          src: imageUrl,
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
    const locationId = intakeItem.shopify_location_gid.replace('gid://shopify/Location/', '')
    
    const inventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels/set.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: intakeItem.quantity || 1
      })
    })

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text()
      console.warn(`Failed to set inventory level: ${errorText}`)
    }

    // Create shopify snapshot with all raw data
    const shopifySnapshot = {
      product_data: productData,
      shopify_response: result,
      sync_timestamp: new Date().toISOString(),
      graded: false
    }

    const { error: updateError } = await supabase
      .from('intake_items')
      .update({
        shopify_product_id: product.id.toString(),
        shopify_variant_id: variant.id.toString(),
        shopify_inventory_item_id: variant.inventory_item_id.toString(),
        last_shopify_synced_at: new Date().toISOString(),
        shopify_sync_status: 'synced',
        pushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        shopify_sync_snapshot: shopifySnapshot,
        image_urls: imageUrl ? [imageUrl] : (intakeItem.image_urls || null),
        updated_by: 'shopify_sync'
      })
      .eq('id', item_id)

    if (updateError) {
      console.error('Failed to update intake item:', updateError)
      throw new Error(`Failed to update intake item: ${updateError.message}`)
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