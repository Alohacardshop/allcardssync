import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { SendGradedSchema, SendGradedInput } from '../_shared/validation.ts'
 import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'

// Helper function to generate barcode for graded items
// Priority: Certificate number (PSA/CGC) > SKU
function generateBarcodeForGradedItem(item: any, intakeItem: any): string {
  // Check for PSA certificate
  const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number;
  if (psaCert) return psaCert;
  
  // Check for CGC certificate
  const cgcCert = intakeItem.cgc_cert || intakeItem.catalog_snapshot?.cgc_cert;
  if (cgcCert) return cgcCert;
  
  // Fallback to SKU
  return item.sku || intakeItem.sku || '';
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
    const input: SendGradedInput = SendGradedSchema.parse(body)
    const { storeKey, locationGid, vendor, item } = input

    // 4. Verify user has access to this store/location
    await requireStoreAccess(user.id, storeKey, locationGid)

    // 5. Log audit trail
    console.log(`[AUDIT] User ${user.id} (${user.email}) triggered shopify-send-graded for store ${storeKey}, item ${item.id}`)

    // Get environment variables for Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the intake item with PSA data and normalized tags
    const { data: intakeItem, error: fetchError } = await supabase
      .from('intake_items')
      .select(`
        *,
        purchase_location:purchase_locations(name, description)
      `)
      .eq('id', item.id)
      .single()

    if (fetchError || !intakeItem) {
      throw new Error(`Failed to fetch intake item: ${fetchError?.message}`)
    }

    // Use normalized_tags as source of truth for Shopify tags
    // Fall back to shopify_tags if normalized_tags not yet populated
    const tagsForShopify = intakeItem.normalized_tags || intakeItem.shopify_tags || [];

    // Extract PSA URL and image from snapshots
    const psaUrl = intakeItem.catalog_snapshot?.psaUrl || 
                   intakeItem.psa_snapshot?.psaUrl || 
                   (intakeItem.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    // Extract primary image URL - prioritize PSA primary image first
    const imageUrl = intakeItem.psa_snapshot?.image_url ||  // PSA primary image (preferred)
                     intakeItem.image_url ||                // Database primary image
                     item.image_url ||                      // Function parameter image
                     intakeItem.catalog_snapshot?.image_url || // Catalog image
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 ? 
                       intakeItem.image_urls[0] : null)     // First image from array as fallback

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase()
    const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
    const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
    
    const domain = Deno.env.get(domainKey)
    const token = Deno.env.get(tokenKey)

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Create graded card title in proper format: "YEAR BRAND SUBJECT #CARDNUMBER VARIANT PSA X"
    const year = item.year || intakeItem.year || 
                 intakeItem.catalog_snapshot?.year || 
                 intakeItem.psa_snapshot?.year || ''
    const brandTitle = item.brand_title || intakeItem.brand_title || ''
    const subject = item.subject || intakeItem.subject || ''
    const grade = item.grade || intakeItem.grade || ''
    const cardNumber = item.card_number || intakeItem.card_number || ''
    const variant = item.variant || intakeItem.variant || ''
    const category = item.category_tag || intakeItem.category || ''
    const gradingCompany = intakeItem.grading_company || 'PSA'
    
    // Extract purchase location
    const purchaseLocation = Array.isArray(intakeItem.purchase_location) 
      ? intakeItem.purchase_location[0]?.name 
      : intakeItem.purchase_location?.name

    let title = item.title
    if (!title) {
      const parts = []
      if (year) parts.push(year)
      if (brandTitle) parts.push(brandTitle.toUpperCase())
      if (subject) parts.push(subject.toUpperCase())
      if (cardNumber) parts.push(`#${cardNumber}`)
      if (variant && variant !== 'Normal') parts.push(variant.toLowerCase())
      if (category && category !== 'Normal') parts.push(category.toLowerCase())
      if (grade) parts.push(`${gradingCompany} ${grade}`)
      
      title = parts.filter(Boolean).join(' ')
    }

    // Create product description with PSA cert number
    const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number
    let description = title
    if (psaCert) description += ` ${psaCert}`
    
    // Add detailed description
    description += `\n\nGraded ${brandTitle} ${subject}`
    if (year) description += ` from ${year}`
    if (grade) description += `, ${gradingCompany} Grade ${grade}`
    if (psaUrl) description += `\n\n${gradingCompany} Certificate: ${psaUrl}`

    // Check if this is a comic
    const isComic = intakeItem.main_category === 'comics' || 
                    intakeItem.catalog_snapshot?.type === 'graded_comic'

    // Check if product already exists in Shopify
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
        value: item.id
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
      value: 'graded'
    });

    // Grading information
    if (gradingCompany) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'grading_company',
        type: 'single_line_text_field',
        value: gradingCompany
      });
    }

    if (grade) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'grade',
        type: 'single_line_text_field',
        value: grade
      });
    }

    if (psaCert) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'cert_number',
        type: 'single_line_text_field',
        value: psaCert
      });
    }

    if (psaUrl) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'cert_url',
        type: 'url',
        value: psaUrl
      });
    }

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

    if (year) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'year',
        type: 'single_line_text_field',
        value: year
      });
    }

    if (variant) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'variant',
        type: 'single_line_text_field',
        value: variant
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

    // Rich JSON data
    if (intakeItem.catalog_snapshot) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'catalog_snapshot',
        type: 'json',
        value: JSON.stringify(intakeItem.catalog_snapshot)
      });
    }

    if (intakeItem.psa_snapshot) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'psa_snapshot',
        type: 'json',
        value: JSON.stringify(intakeItem.psa_snapshot)
      });
    }

    if (intakeItem.grading_data) {
      metafields.push({
        namespace: 'acs.sync',
        key: 'grading_data',
        type: 'json',
        value: JSON.stringify(intakeItem.grading_data)
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

    // Build tags array using normalized_tags as source of truth (for sync TO Shopify)
    // Include additional context tags not in normalized_tags
    const additionalTags = [
      gradingCompany,
      grade ? `Grade ${grade}` : null,
      vendor,
      purchaseLocation ? `Purchased: ${purchaseLocation}` : null
    ].filter(Boolean);

    // Merge normalized tags with additional context tags
    const tagsArray = [...new Set([
      ...tagsForShopify,
      ...additionalTags,
      isComic ? 'comics' : null,
      isComic ? 'graded' : null,
      intakeItem.primary_category,
      intakeItem.condition_type
    ].filter(Boolean))];

    // Prepare Shopify product data (without metafields - will add them separately)
    const productData = {
      product: {
        title: title,
        body_html: description,
        vendor: vendor || brandTitle || (isComic ? 'Comics' : 'Trading Cards'),
        product_type: isComic ? 'Graded Comic' : 'Graded Card',
        tags: tagsArray.join(', '),
        variants: [{
          sku: item.sku,
          price: item.price?.toString() || '0.00',
          cost: item.cost ? item.cost.toString() : (intakeItem.cost ? intakeItem.cost.toString() : undefined),
          inventory_quantity: item.quantity || 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: generateBarcodeForGradedItem(item, intakeItem),
          inventory_policy: 'deny',
          weight: intakeItem.product_weight || 3,
          weight_unit: 'oz'
        }],
        images: imageUrl ? [{
          src: imageUrl,
          alt: title
        }] : []
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
            price: item.price?.toString() || '0.00',
            cost: item.cost ? item.cost.toString() : (intakeItem.cost ? intakeItem.cost.toString() : undefined),
            sku: item.sku,
            barcode: generateBarcodeForGradedItem(item, intakeItem),
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
    const requestId = generateRequestId('send-graded')
    const locationId = locationGidToId(locationGid)
    
    const inventoryResult = await writeInventory({
      domain,
      token,
      inventory_item_id: String(variant.inventory_item_id),
      location_id: locationId,
      action: 'initial_set',
      quantity: item.quantity || 1,
      request_id: requestId,
      store_key: storeKey,
      item_id: item.id,
      sku: item.sku,
      source_function: 'v2-shopify-send-graded',
      triggered_by: user.id,
      supabase
    })

    if (!inventoryResult.success) {
      console.warn(`Failed to set inventory level: ${inventoryResult.error}`)
    }

    // Now create metafields separately after product creation
    
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

    // Update intake item with Shopify IDs and preserve all raw data
    const shopifySnapshot = {
      product_data: productData,
      shopify_response: result,
      sync_timestamp: new Date().toISOString(),
      graded: true
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
        image_urls: imageUrl ? [imageUrl] : intakeItem.image_urls,
        updated_by: 'shopify_sync'
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