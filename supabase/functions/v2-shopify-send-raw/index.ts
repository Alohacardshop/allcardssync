import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { SendRawSchema, SendRawInput } from '../_shared/validation.ts'
 import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'

// Helper function to fetch image and convert to base64 for Shopify upload
async function fetchImageAsBase64(imageUrl: string): Promise<{ attachment: string; filename: string } | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopifySync/1.0)'
      }
    })
    
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${response.status} ${response.statusText}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Convert to base64
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const base64 = btoa(binary)
    
    // Determine file extension from content type
    let extension = 'jpg'
    if (contentType.includes('png')) extension = 'png'
    else if (contentType.includes('gif')) extension = 'gif'
    else if (contentType.includes('webp')) extension = 'webp'
    
    return { attachment: base64, filename: `product.${extension}` }
  } catch (error) {
    console.warn('Failed to fetch image for base64 encoding:', error)
    return null
  }
}

// Helper function to generate barcode for raw cards
// Priority: Certificate number (if graded) > TCGPlayer ID > SKU
function generateBarcodeForRawCard(item: any): string {
  // Check for grading certificates first (in case item has grading info)
  const psaCert = item.psa_cert || item.psa_cert_number;
  if (psaCert) return psaCert;
  
  const cgcCert = item.cgc_cert || item.catalog_snapshot?.cgc_cert;
  if (cgcCert) return cgcCert;
  
  // Use TCGPlayer ID for true raw cards
  const tcgPlayerId = item.catalog_snapshot?.tcgplayer_id;
  if (tcgPlayerId) return tcgPlayerId;
  
  // Fallback to SKU
  return item.sku || '';
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

    // 3. Validate input with Zod schema
    const body = await req.json()
    const input: SendRawInput = SendRawSchema.parse(body)
    const { item_id, storeKey, locationGid, vendor } = input

    // 4. Verify user has access to this store/location BEFORE fetching item (SECURITY)
    await requireStoreAccess(user.id, storeKey, locationGid)

    // 5. Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 6. Get intake item data with purchase location
    const { data: intakeItem, error: fetchError } = await supabase
      .from('intake_items')
      .select(`
        *,
        purchase_location:purchase_locations(name, description)
      `)
      .eq('id', item_id)
      .single()
    
    if (fetchError || !intakeItem) {
      throw new Error(`Failed to fetch intake item: ${fetchError?.message || 'Item not found'}`)
    }

    // 7. Cross-check that item belongs to the claimed store/location (SECURITY)
    if (intakeItem.store_key !== storeKey) {
      throw new Error(`Access denied: Item belongs to store "${intakeItem.store_key}", not "${storeKey}"`)
    }
    if (intakeItem.shopify_location_gid !== locationGid) {
      throw new Error(`Access denied: Item belongs to different location`)
    }

    // Extract image URL from various sources
    const imageUrl = intakeItem.catalog_snapshot?.photo_url || 
                     intakeItem.catalog_snapshot?.image_url || 
                     intakeItem.psa_snapshot?.image_url ||
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) ? intakeItem.image_urls[0] : null) ||
                     (intakeItem.catalog_snapshot?.image_urls && Array.isArray(intakeItem.catalog_snapshot.image_urls) ? intakeItem.catalog_snapshot.image_urls[0] : null)

    // 8. Log audit trail
    console.log(`[AUDIT] User ${user.id} (${user.email}) triggered shopify-send-raw for store ${storeKey}, item ${item_id}`)

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
    
    // Add sample image disclaimer if image is present
    if (imageUrl) {
      description += `\n\n<p><em>⚠️ NOTE: Product image is for reference only and may not represent the exact item. The card you receive will be in the stated condition but actual appearance may vary.</em></p>`
    }
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
      
      // Update inventory level using centralized helper
      // For existing products, we use receiving (delta) to add stock
      const requestId = generateRequestId('send-raw-adjust')
      const inventoryResult = await writeInventory({
        domain,
        token,
        inventory_item_id: String(variant.inventory_item_id),
        location_id: locationId,
        action: 'receiving',
        quantity: intakeItem.quantity || 1,
        request_id: requestId,
        store_key: storeKey,
        item_id: item_id,
        sku: intakeItem.sku,
        source_function: 'v2-shopify-send-raw',
        triggered_by: user.id,
        supabase
      })

      if (!inventoryResult.success) {
        throw new Error(`Failed to update inventory level: ${inventoryResult.error}`)
      }

      // Create shopify snapshot with adjustment data
      const shopifySnapshot = {
        action: 'quantity_adjusted',
        existing_product_id: product.id,
        old_quantity: currentQuantity,
        new_quantity: inventoryResult.new_available ?? newQuantity,
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

    // Check if product already exists in database (for resync)
    const existingProductId = intakeItem.shopify_product_id
    const existingVariantId = intakeItem.shopify_variant_id
    const isUpdate = !!(existingProductId && existingVariantId)


    // Build comprehensive metafields array
    const metafields = [
      {
        namespace: 'acs.sync',
        key: 'external_id',
        type: 'single_line_text_field',
        value: intakeItem.id
      },
      {
        namespace: 'acs.sync',
        key: 'intake_id',
        type: 'single_line_text_field',
        value: item_id
      }
    ];

    // Core classification
    if (intakeItem.main_category) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'main_category',
        type: 'single_line_text_field',
        value: intakeItem.main_category
      });
    }

    if (intakeItem.sub_category) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'sub_category',
        type: 'single_line_text_field',
        value: intakeItem.sub_category
      });
    }

    metafields.push({
      namespace: 'acs.sync',
      key: 'item_type',
      type: 'single_line_text_field',
      value: 'raw'
    });

    // Card details
    if (brandTitle) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'brand_title',
        type: 'single_line_text_field',
        value: brandTitle
      });
    }

    if (cardNumber) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'card_number',
        type: 'single_line_text_field',
        value: cardNumber
      });
    }

    if (intakeItem.year) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'year',
        type: 'single_line_text_field',
        value: intakeItem.year
      });
    }

    if (condition) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'variant',
        type: 'single_line_text_field',
        value: condition
      });
    }

    if (subject) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'subject',
        type: 'single_line_text_field',
        value: subject
      });
    }

    // Purchase location
    if (purchaseLocation) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'purchase_location',
        type: 'single_line_text_field',
        value: purchaseLocation
      });
    }

    // Rich JSON data
    if (intakeItem.catalog_snapshot) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'catalog_snapshot',
        type: 'json',
        value: JSON.stringify(intakeItem.catalog_snapshot)
      });
    }

    // Build tags array with main_category, sub_category, and purchase location
    const purchaseLocation = Array.isArray(intakeItem.purchase_location) ? intakeItem.purchase_location[0]?.name : intakeItem.purchase_location?.name;
    const tagsArray = [...new Set(isComic ? [
      'comics',
      'raw',
      brandTitle, // Publisher (DC, Marvel, etc.)
      condition,
      intakeItem.main_category,
      intakeItem.sub_category || 'american', // Comic sub-category
      intakeItem.lot_number || 'Unknown Lot',
      subject ? `Title: ${subject}` : null,
      cardNumber ? `Issue: ${cardNumber}` : null,
      vendor,
      purchaseLocation ? `Purchased: ${purchaseLocation}` : null
    ].filter(Boolean) : [
      'Raw Card',
      'single', 
      brandTitle, 
      condition, // Condition as separate tag
      intakeItem.main_category,
      intakeItem.sub_category || (intakeItem.main_category === 'comics' ? 'american' : 'pokemon'), // Use sub_category or default by main_category
      intakeItem.lot_number || 'Unknown Lot', // Lot number
      subject ? `Card: ${subject}` : null, // Card name
      cardNumber ? `Number: ${cardNumber}` : null, // Card number
      vendor, // Add vendor to tags
      purchaseLocation ? `Purchased: ${purchaseLocation}` : null
    ].filter(Boolean))];

    // Fetch image and convert to base64 for Shopify upload (avoids hotlink blocking)
    let imageData: { attachment: string; filename: string } | null = null
    if (imageUrl) {
      imageData = await fetchImageAsBase64(imageUrl)
    }

    // Prepare Shopify product data (without metafields - will add them separately)
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: vendor || brandTitle || (isComic ? 'Comics' : 'Trading Cards'),
        product_type: isComic ? 'Raw Comic' : 'Raw Card',
        tags: tagsArray.join(', '),
        variants: [{
          sku: intakeItem.sku,
          price: intakeItem.price?.toString() || '0.00',
          cost: intakeItem.cost ? intakeItem.cost.toString() : undefined,
          inventory_quantity: intakeItem.quantity || 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: generateBarcodeForRawCard(intakeItem),
          inventory_policy: 'deny',
          weight: intakeItem.product_weight || 3,
          weight_unit: 'oz'
        }],
        images: imageData ? [{
          attachment: imageData.attachment,
          filename: imageData.filename,
          alt: title
        }] : (imageUrl ? [{
          src: imageUrl,
          alt: title
        }] : [])
      }
    }

    let product, variant

    if (isUpdate) {
      // UPDATE existing product
      
      
      const updateResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${existingProductId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        throw new Error(`Failed to update Shopify product: ${errorText}`)
      }

      const updateResult = await updateResponse.json()
      product = updateResult.product
      variant = product.variants.find((v: any) => v.id.toString() === existingVariantId) || product.variants[0]
      
      // Update the variant with new price and SKU
      const variantUpdateResponse = await fetch(`https://${domain}/admin/api/2024-07/variants/${variant.id}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variant: {
            id: variant.id,
            price: intakeItem.price?.toString() || '0.00',
            cost: intakeItem.cost ? intakeItem.cost.toString() : undefined,
            sku: intakeItem.sku,
            barcode: generateBarcodeForRawCard(intakeItem),
            weight: intakeItem.product_weight || 3,
            weight_unit: 'oz'
          }
        })
      })

      if (!variantUpdateResponse.ok) {
        const errorText = await variantUpdateResponse.text()
        console.warn(`Failed to update variant: ${errorText}`)
      }

    } else {
      // CREATE new product
      console.log('DEBUG: Creating new Shopify product')
      
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
      product = result.product
      variant = product.variants[0]
    }

    // Set inventory level at location using centralized helper
    const requestId = generateRequestId('send-raw-new')
    const locationId = locationGidToId(intakeItem.shopify_location_gid)
    
    const inventoryResult = await writeInventory({
      domain,
      token,
      inventory_item_id: String(variant.inventory_item_id),
      location_id: locationId,
      action: 'initial_set',
      quantity: intakeItem.quantity || 1,
      request_id: requestId,
      store_key: storeKey,
      item_id: item_id,
      sku: intakeItem.sku,
      source_function: 'v2-shopify-send-raw',
      triggered_by: user.id,
      supabase
    })

    if (!inventoryResult.success) {
      console.warn(`Failed to set inventory level: ${inventoryResult.error}`)
    }

    // Now create metafields separately after product creation
    console.log('DEBUG: Creating metafields for product:', product.id)
    
    // Add tags as a list metafield (not JSON string)
    metafields.push({
      namespace: 'acs.sync',
      key: 'tags',
      type: 'list.single_line_text_field',
      value: JSON.stringify(tagsArray) // Shopify REST API expects JSON string for lists
    });

    // Create each metafield
    for (const metafield of metafields) {
      try {
        const metafieldResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ metafield })
        })

        if (!metafieldResponse.ok) {
          const errorText = await metafieldResponse.text()
          console.warn(`Failed to create metafield ${metafield.namespace}.${metafield.key}: ${errorText}`)
        } else {
          console.log(`Successfully created metafield: ${metafield.namespace}.${metafield.key}`)
        }
      } catch (metafieldError) {
        console.warn(`Error creating metafield ${metafield.namespace}.${metafield.key}:`, metafieldError)
      }
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
    
    // Determine appropriate status code
    let status = 500
    if (error.message?.includes('Authorization') || error.message?.includes('authentication')) {
      status = 401
    } else if (error.message?.includes('permissions') || error.message?.includes('Access denied')) {
      status = 403
    } else if (error.message?.includes('Invalid') || error.message?.includes('validation')) {
      status = 400
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})