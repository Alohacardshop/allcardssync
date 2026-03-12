import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { SendGradedSchema, SendGradedInput } from '../_shared/validation.ts'
import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'
import { ensureMediaOrder, determineFrontImageUrl } from '../_shared/shopify-media-order.ts'

/**
 * Retry wrapper for Shopify API calls.
 * Retries on transient errors (429, 500, 502, 503, 504) with exponential backoff.
 * Max 3 retries: immediate → 1s → 2s → 4s
 */
async function shopifyFetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  const retryDelays = [0, 1000, 2000, 4000]
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelays[attempt] || 4000
      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries + 1} for ${url}, waiting ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }

    try {
      const response = await fetch(url, options)
      
      // Don't retry on success or non-retryable errors
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
        return response
      }

      // Log retryable failure
      console.warn(`[RETRY] HTTP ${response.status} from ${url} (attempt ${attempt + 1}/${maxRetries + 1})`)
      
      if (attempt >= maxRetries) {
        return response // Return last failed response
      }
    } catch (err) {
      console.warn(`[RETRY] Network error for ${url} (attempt ${attempt + 1}/${maxRetries + 1}):`, err)
      if (attempt >= maxRetries) throw err
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error(`[RETRY] Exhausted all retries for ${url}`)
}

// Helper function to generate barcode for graded items
// Priority: Certificate number (PSA/CGC) > SKU
function generateBarcodeForGradedItem(item: any, intakeItem: any): string {
  const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number;
  if (psaCert) return psaCert;
  const cgcCert = intakeItem.cgc_cert || intakeItem.catalog_snapshot?.cgc_cert;
  if (cgcCert) return cgcCert;
  return item.sku || intakeItem.sku || '';
}

/**
 * Deduplicate title parts while preserving original casing.
 * Prevents titles like "2023 Pokemon Pikachu #25 holo holo PSA 10"
 */
function deduplicateParts(parts: string[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const part of parts) {
    const key = part.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      cleaned.push(part)
    }
  }
  return cleaned
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

    // ── Duplicate protection: if product already exists in Shopify, force update path ──
    const existingProductId = intakeItem.shopify_product_id
    const existingVariantId = intakeItem.shopify_variant_id
    const isUpdate = !!(existingProductId && existingVariantId)

    // Structured logging: sync start
    console.log(JSON.stringify({
      event: 'shopify_sync_start',
      item_id: item.id,
      sku: item.sku,
      store: storeKey,
      isUpdate,
      existing_product_id: existingProductId || null
    }))

    if (!isUpdate && intakeItem.shopify_product_id) {
      // Product ID exists but variant ID is missing — still treat as duplicate prevention
      console.warn(`[SYNC] Duplicate product creation prevented for item ${item.id} — shopify_product_id already set: ${intakeItem.shopify_product_id}`)
    }

    // Use normalized_tags as source of truth for Shopify tags
    const tagsForShopify = intakeItem.normalized_tags || intakeItem.shopify_tags || [];

    // Extract PSA URL and image from snapshots
    const psaUrl = intakeItem.catalog_snapshot?.psaUrl || 
                   intakeItem.psa_snapshot?.psaUrl || 
                   (intakeItem.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    // Extract primary image URL - prioritize PSA primary image first
    const imageUrl = intakeItem.psa_snapshot?.image_url ||
                     intakeItem.image_url ||
                     item.image_url ||
                     intakeItem.catalog_snapshot?.image_url ||
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 ? 
                       intakeItem.image_urls[0] : null)

    // Get Shopify credentials from system_settings table
    const storeUpper = storeKey.toUpperCase()
    
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single()

    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single()

    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    // Shopify API request helpers (with retry)
    const shopifyHeaders = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }

    // Create graded card title in proper format
    const year = item.year || intakeItem.year || 
                 intakeItem.catalog_snapshot?.year || 
                 intakeItem.psa_snapshot?.year || ''
    const brandTitle = item.brand_title || intakeItem.brand_title || ''
    const subject = item.subject || intakeItem.subject || ''
    const grade = item.grade || intakeItem.grade || ''
    const cardNumber = item.card_number || intakeItem.card_number || ''
    const cardVariant = item.variant || intakeItem.variant || ''
    const category = item.category_tag || intakeItem.category || ''
    const gradingCompany = intakeItem.grading_company || 'PSA'
    
    const purchaseLocation = Array.isArray(intakeItem.purchase_location) 
      ? intakeItem.purchase_location[0]?.name 
      : intakeItem.purchase_location?.name

    let title = item.title
    if (!title) {
      const parts = []
      if (year) parts.push(year)
      if (brandTitle) parts.push(brandTitle)
      if (subject) parts.push(subject)
      if (cardNumber) parts.push(`#${cardNumber}`)
      if (cardVariant) parts.push(cardVariant)
      if (category && category !== 'Normal') parts.push(category.toLowerCase())
      if (grade) parts.push(`${gradingCompany} ${grade}`)
      
      // Deduplicate parts to prevent titles like "holo holo"
      const cleanedParts = deduplicateParts(parts.filter(Boolean))
      title = cleanedParts.join(' ')
    }

    // Create product description with PSA cert number
    const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number
    let description = title
    if (psaCert) description += ` ${psaCert}`
    
    description += `\n\nGraded ${brandTitle} ${subject}`
    if (year) description += ` from ${year}`
    if (grade) description += `, ${gradingCompany} Grade ${grade}`
    if (psaUrl) description += `\n\n${gradingCompany} Certificate: ${psaUrl}`

    // Check if this is a comic
    const isComic = intakeItem.main_category === 'comics' || 
                    intakeItem.catalog_snapshot?.type === 'graded_comic'

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

    if (intakeItem.main_category) {
      metafields.push({ namespace: 'acs.sync', key: 'main_category', type: 'single_line_text_field', value: intakeItem.main_category });
    }
    if (intakeItem.sub_category) {
      metafields.push({ namespace: 'acs.sync', key: 'sub_category', type: 'single_line_text_field', value: intakeItem.sub_category });
    }
    metafields.push({ namespace: 'acs.sync', key: 'item_type', type: 'single_line_text_field', value: 'graded' });
    if (gradingCompany) {
      metafields.push({ namespace: 'acs.sync', key: 'grading_company', type: 'single_line_text_field', value: gradingCompany });
    }
    if (grade) {
      metafields.push({ namespace: 'acs.sync', key: 'grade', type: 'single_line_text_field', value: grade });
    }
    if (psaCert) {
      metafields.push({ namespace: 'acs.sync', key: 'cert_number', type: 'single_line_text_field', value: psaCert });
    }
    if (psaUrl) {
      metafields.push({ namespace: 'acs.sync', key: 'cert_url', type: 'url', value: psaUrl });
    }
    if (brandTitle) {
      metafields.push({ namespace: 'acs.sync', key: 'brand_title', type: 'single_line_text_field', value: brandTitle });
    }
    if (cardNumber) {
      metafields.push({ namespace: 'acs.sync', key: 'card_number', type: 'single_line_text_field', value: cardNumber });
    }
    if (year) {
      metafields.push({ namespace: 'acs.sync', key: 'year', type: 'single_line_text_field', value: year });
    }
    if (cardVariant) {
      metafields.push({ namespace: 'acs.sync', key: 'variant', type: 'single_line_text_field', value: cardVariant });
    }
    if (subject) {
      metafields.push({ namespace: 'acs.sync', key: 'subject', type: 'single_line_text_field', value: subject });
    }
    if (intakeItem.catalog_snapshot) {
      metafields.push({ namespace: 'acs.sync', key: 'catalog_snapshot', type: 'json', value: JSON.stringify(intakeItem.catalog_snapshot) });
    }
    if (intakeItem.psa_snapshot) {
      metafields.push({ namespace: 'acs.sync', key: 'psa_snapshot', type: 'json', value: JSON.stringify(intakeItem.psa_snapshot) });
    }
    if (intakeItem.grading_data) {
      metafields.push({ namespace: 'acs.sync', key: 'grading_data', type: 'json', value: JSON.stringify(intakeItem.grading_data) });
    }
    if (purchaseLocation) {
      metafields.push({ namespace: 'acs.sync', key: 'purchase_location', type: 'single_line_text_field', value: purchaseLocation });
    }

    // Build tags array
    const additionalTags = [
      gradingCompany,
      grade ? `Grade ${grade}` : null,
      vendor,
      purchaseLocation ? `Purchased: ${purchaseLocation}` : null
    ].filter(Boolean);

    const tagsArray = [...new Set([
      ...tagsForShopify,
      ...additionalTags,
      isComic ? 'comics' : null,
      isComic ? 'graded' : null,
      intakeItem.primary_category,
      intakeItem.condition_type
    ].filter(Boolean))];

    // Prepare Shopify product data
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
          inventory_quantity: 1,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          barcode: generateBarcodeForGradedItem(item, intakeItem),
          inventory_policy: 'deny',
          weight: isComic ? 1.5 : (intakeItem.product_weight || 3.5),
          weight_unit: isComic ? 'lb' : 'oz'
        }],
        // FRONT-ONLY IMAGE: Send only the front image to Shopify
        images: (() => {
          const frontUrl = determineFrontImageUrl(intakeItem);
          const singleUrl = frontUrl || imageUrl || 
            (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 
              ? intakeItem.image_urls[0] : null);
          if (singleUrl) {
            console.log(`[FRONT-ONLY] Sending single image to Shopify: ${singleUrl}`);
            return [{ src: singleUrl, alt: title, position: 1 }];
          }
          return [];
        })()
      }
    }

    let product: any, variant: any, shopifyResponse: any

    if (isUpdate) {
      // UPDATE existing product (uses retry wrapper)
      const updateResponse = await shopifyFetchWithRetry(
        `https://${domain}/admin/api/2024-07/products/${existingProductId}.json`,
        { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify(productData) }
      )

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        throw new Error(`Failed to update Shopify product: ${errorText}`)
      }

      const updateResult = await updateResponse.json()
      shopifyResponse = updateResult
      product = updateResult.product
      variant = product.variants.find((v: any) => v.id.toString() === existingVariantId) || product.variants[0]
      
      // Update the variant with new price and SKU (uses retry wrapper)
      const variantUpdateResponse = await shopifyFetchWithRetry(
        `https://${domain}/admin/api/2024-07/variants/${variant.id}.json`,
        {
          method: 'PUT',
          headers: shopifyHeaders,
          body: JSON.stringify({
            variant: {
              id: variant.id,
              price: item.price?.toString() || '0.00',
              cost: item.cost ? item.cost.toString() : (intakeItem.cost ? intakeItem.cost.toString() : undefined),
              sku: item.sku,
              barcode: generateBarcodeForGradedItem(item, intakeItem),
              weight: isComic ? 1.5 : (intakeItem.product_weight || 3.5),
              weight_unit: isComic ? 'lb' : 'oz'
            }
          })
        }
      )

      if (!variantUpdateResponse.ok) {
        const errorText = await variantUpdateResponse.text()
        console.warn(`Failed to update variant: ${errorText}`)
      }

    } else {
      // CREATE new product (uses retry wrapper)
      const createResponse = await shopifyFetchWithRetry(
        `https://${domain}/admin/api/2024-07/products.json`,
        { method: 'POST', headers: shopifyHeaders, body: JSON.stringify(productData) }
      )

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        throw new Error(`Failed to create Shopify product: ${errorText}`)
      }

      const result = await createResponse.json()
      shopifyResponse = result
      product = result.product
      variant = product.variants[0]
    }

    // Ensure front image is featured using shared helper (verification/safety net)
    const frontUrl = determineFrontImageUrl(intakeItem)
    if (frontUrl) {
      const mediaResult = await ensureMediaOrder({
        domain,
        token,
        productId: product.id.toString(),
        intendedFrontUrl: frontUrl
      })
      if (!mediaResult.success) {
        console.warn(`[MEDIA ORDER] ${mediaResult.message}`)
      }
    }

    // ── Inventory write: only on CREATE, never on UPDATE ──
    // Prevents accidental inventory resets when re-syncing existing products
    if (!isUpdate) {
      const requestId = generateRequestId('send-graded')
      const locationId = locationGidToId(locationGid)
      
      const inventoryResult = await writeInventory({
        domain,
        token,
        inventory_item_id: String(variant.inventory_item_id),
        location_id: locationId,
        action: 'initial_set',
        quantity: 1, // Graded = 1-of-1, always
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
    } else {
      console.log(`[INVENTORY] Skipping inventory write for update (product ${product.id}) to prevent reset`)
    }

    // Create metafields (with retry wrapper)
    metafields.push({
      namespace: 'acs.sync',
      key: 'tags',
      type: 'list.single_line_text_field',
      value: JSON.stringify(tagsArray)
    });

    for (const metafield of metafields) {
      try {
        const metafieldResponse = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`,
          { method: 'POST', headers: shopifyHeaders, body: JSON.stringify({ metafield }) }
        )

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

    // Update intake item with Shopify IDs
    // FIX: Preserve original image_urls array — never overwrite with a single-element array
    const resolvedFrontUrl = determineFrontImageUrl(intakeItem) || intakeItem.image_url
    const shopifySnapshot = {
      product_data: productData,
      shopify_response: shopifyResponse,
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
        // Preserve the full image array — never overwrite with a subset
        image_urls: intakeItem.image_urls,
        // Save the resolved front image URL for quick reference
        image_url: resolvedFrontUrl,
        updated_by: 'shopify_sync'
      })
      .eq('id', item.id)

    if (updateError) {
      console.error('Failed to update intake item:', updateError)
    }

    // Structured logging: sync complete
    console.log(JSON.stringify({
      event: 'shopify_sync_complete',
      item_id: item.id,
      sku: item.sku,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      isUpdate,
      store: storeKey
    }))

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
    // Structured error logging
    console.error(JSON.stringify({
      event: 'shopify_sync_error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | ')
    }))
    
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
