import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import { SendGradedSchema, SendGradedInput } from '../_shared/validation.ts'
import { writeInventory, generateRequestId, locationGidToId } from '../_shared/inventory-write.ts'
import { ensureMediaOrder, determineFrontImageUrl } from '../_shared/shopify-media-order.ts'

// ── Timing helper ──
function timer() {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

/**
 * Retry wrapper for Shopify API calls.
 * Retries on transient errors (429, 500, 502, 503, 504) with exponential backoff.
 * Up to 4 attempts: immediate → 1s → 2s → 4s
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
      
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
        return response
      }

      console.warn(`[RETRY] HTTP ${response.status} from ${url} (attempt ${attempt + 1}/${maxRetries + 1})`)
      
      if (attempt >= maxRetries) {
        return response
      }
    } catch (err) {
      console.warn(`[RETRY] Network error for ${url} (attempt ${attempt + 1}/${maxRetries + 1}):`, err)
      if (attempt >= maxRetries) throw err
    }
  }

  throw new Error(`[RETRY] Exhausted all retries for ${url}`)
}

// Helper function to generate barcode for graded items
function generateBarcodeForGradedItem(item: any, intakeItem: any): string {
  const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number;
  if (psaCert) return psaCert;
  const cgcCert = intakeItem.cgc_cert || intakeItem.catalog_snapshot?.cgc_cert;
  if (cgcCert) return cgcCert;
  return item.sku || intakeItem.sku || '';
}

/**
 * Deduplicate title parts while preserving original casing.
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

/**
 * Compare existing Shopify product with intended data and return only changed fields.
 * Returns null if nothing changed.
 */
function buildUpdateDiff(existing: any, intended: any): any | null {
  const diff: any = {}
  let hasChanges = false

  if (existing.title !== intended.title) { diff.title = intended.title; hasChanges = true }
  if (existing.body_html !== intended.body_html) { diff.body_html = intended.body_html; hasChanges = true }
  if (existing.vendor !== intended.vendor) { diff.vendor = intended.vendor; hasChanges = true }
  if (existing.product_type !== intended.product_type) { diff.product_type = intended.product_type; hasChanges = true }
  
  const existingTags = (existing.tags || '').split(', ').sort().join(', ')
  const intendedTags = (intended.tags || '').split(', ').sort().join(', ')
  if (existingTags !== intendedTags) { diff.tags = intended.tags; hasChanges = true }

  return hasChanges ? diff : null
}

/**
 * Compare existing variant with intended data and return only changed fields.
 */
function buildVariantDiff(existing: any, intended: any): any | null {
  const diff: any = { id: existing.id }
  let hasChanges = false

  if (existing.price !== intended.price) { diff.price = intended.price; hasChanges = true }
  if (intended.cost !== undefined && existing.cost !== intended.cost) { diff.cost = intended.cost; hasChanges = true }
  if (existing.sku !== intended.sku) { diff.sku = intended.sku; hasChanges = true }
  if (existing.barcode !== intended.barcode) { diff.barcode = intended.barcode; hasChanges = true }
  if (existing.weight?.toString() !== intended.weight?.toString()) { diff.weight = intended.weight; hasChanges = true }
  if (existing.weight_unit !== intended.weight_unit) { diff.weight_unit = intended.weight_unit; hasChanges = true }

  return hasChanges ? diff : null
}

/**
 * Check if existing product already has the correct front image.
 * Compares by matching the source URL substring in existing image src.
 */
function productHasCorrectImage(existingProduct: any, intendedImageUrl: string): boolean {
  if (!existingProduct?.images?.length || !intendedImageUrl) return false
  const firstImage = existingProduct.images[0]
  // Shopify may rewrite URLs — check if the original src contains a recognizable portion
  // For PSA/CGC images the filename is usually preserved
  const intendedFilename = intendedImageUrl.split('/').pop()?.split('?')[0] || ''
  const existingSrc = firstImage.src || ''
  // If position 1 image exists and its alt or src matches, skip re-upload
  if (firstImage.position === 1 && intendedFilename && existingSrc.includes(intendedFilename)) {
    return true
  }
  return false
}

/**
 * Filter metafields to only those that differ from existing ones.
 * Returns only metafields that need to be created or updated.
 */
function filterChangedMetafields(
  intended: Array<{ namespace: string; key: string; type: string; value: string }>,
  existing: Array<{ namespace: string; key: string; value: string }>
): Array<{ namespace: string; key: string; type: string; value: string }> {
  const existingMap = new Map<string, string>()
  for (const mf of existing) {
    existingMap.set(`${mf.namespace}.${mf.key}`, mf.value)
  }
  return intended.filter(mf => {
    const existingValue = existingMap.get(`${mf.namespace}.${mf.key}`)
    return existingValue !== mf.value
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const totalTimer = timer()

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

    // ── Duplicate protection: compute from shopify_product_id alone ──
    const hasExistingProduct = !!intakeItem.shopify_product_id
    const hasExistingVariant = !!intakeItem.shopify_variant_id
    const existingProductId = intakeItem.shopify_product_id
    const existingVariantId = intakeItem.shopify_variant_id
    const isUpdate = hasExistingProduct && hasExistingVariant

    // Structured logging: sync start
    console.log(JSON.stringify({
      event: 'shopify_sync_start',
      item_id: item.id,
      sku: item.sku,
      store: storeKey,
      isUpdate,
      hasExistingProduct,
      hasExistingVariant,
      existing_product_id: existingProductId || null,
      existing_variant_id: existingVariantId || null
    }))

    // ── GUARD: Block create when product exists but variant linkage is missing ──
    if (hasExistingProduct && !hasExistingVariant) {
      console.error(JSON.stringify({
        event: 'shopify_sync_blocked_duplicate_risk',
        item_id: item.id,
        sku: item.sku,
        shopify_product_id: intakeItem.shopify_product_id,
        reason: 'existing product without variant linkage'
      }))
      throw new Error(
        `Duplicate protection: item ${item.id} already has shopify_product_id ${intakeItem.shopify_product_id} but shopify_variant_id is missing. ` +
        `Aborting to prevent duplicate. Manual repair required — set shopify_variant_id or clear shopify_product_id to re-sync.`
      )
    }

    if (isUpdate) {
      console.warn(JSON.stringify({
        event: 'shopify_sync_forced_update_existing_product',
        item_id: item.id,
        sku: item.sku,
        shopify_product_id: intakeItem.shopify_product_id,
        shopify_variant_id: intakeItem.shopify_variant_id
      }))
    }

    // Use normalized_tags as source of truth for Shopify tags
    const tagsForShopify = intakeItem.normalized_tags || intakeItem.shopify_tags || [];

    // Extract PSA URL and image from snapshots
    const psaUrl = intakeItem.catalog_snapshot?.psaUrl || 
                   intakeItem.psa_snapshot?.psaUrl || 
                   (intakeItem.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    // Extract primary image URL
    const imageUrl = intakeItem.psa_snapshot?.image_url ||
                     intakeItem.image_url ||
                     item.image_url ||
                     intakeItem.catalog_snapshot?.image_url ||
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 ? 
                       intakeItem.image_urls[0] : null)

    // Get Shopify credentials from system_settings table
    const storeUpper = storeKey.toUpperCase()
    
    const [{ data: domainSetting }, { data: tokenSetting }] = await Promise.all([
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`).single(),
      supabase.from('system_settings').select('key_value').eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`).single()
    ])

    const domain = domainSetting?.key_value
    const token = tokenSetting?.key_value

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`)
    }

    const shopifyHeaders = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }

    // ── Build title, description, tags (unchanged logic) ──
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
      
      const cleanedParts = deduplicateParts(parts.filter(Boolean))
      title = cleanedParts.join(' ')
    }

    const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number
    let description = title
    if (psaCert) description += ` ${psaCert}`
    
    description += `\n\nGraded ${brandTitle} ${subject}`
    if (year) description += ` from ${year}`
    if (grade) description += `, ${gradingCompany} Grade ${grade}`
    if (psaUrl) description += `\n\n${gradingCompany} Certificate: ${psaUrl}`

    const isComic = intakeItem.main_category === 'comics' || 
                    intakeItem.catalog_snapshot?.type === 'graded_comic'

    // ── Build metafields array ──
    const metafields: Array<{ namespace: string; key: string; type: string; value: string }> = [
      { namespace: 'acs.sync', key: 'external_id', type: 'single_line_text_field', value: intakeItem.id },
      { namespace: 'acs.sync', key: 'intake_id', type: 'single_line_text_field', value: item.id }
    ];

    if (intakeItem.main_category) metafields.push({ namespace: 'acs.sync', key: 'main_category', type: 'single_line_text_field', value: intakeItem.main_category });
    if (intakeItem.sub_category) metafields.push({ namespace: 'acs.sync', key: 'sub_category', type: 'single_line_text_field', value: intakeItem.sub_category });
    metafields.push({ namespace: 'acs.sync', key: 'item_type', type: 'single_line_text_field', value: 'graded' });
    if (gradingCompany) metafields.push({ namespace: 'acs.sync', key: 'grading_company', type: 'single_line_text_field', value: gradingCompany });
    if (grade) metafields.push({ namespace: 'acs.sync', key: 'grade', type: 'single_line_text_field', value: grade });
    if (psaCert) metafields.push({ namespace: 'acs.sync', key: 'cert_number', type: 'single_line_text_field', value: psaCert });
    if (psaUrl) metafields.push({ namespace: 'acs.sync', key: 'cert_url', type: 'url', value: psaUrl });
    if (brandTitle) metafields.push({ namespace: 'acs.sync', key: 'brand_title', type: 'single_line_text_field', value: brandTitle });
    if (cardNumber) metafields.push({ namespace: 'acs.sync', key: 'card_number', type: 'single_line_text_field', value: cardNumber });
    if (year) metafields.push({ namespace: 'acs.sync', key: 'year', type: 'single_line_text_field', value: year });
    if (cardVariant) metafields.push({ namespace: 'acs.sync', key: 'variant', type: 'single_line_text_field', value: cardVariant });
    if (subject) metafields.push({ namespace: 'acs.sync', key: 'subject', type: 'single_line_text_field', value: subject });
    if (intakeItem.catalog_snapshot) metafields.push({ namespace: 'acs.sync', key: 'catalog_snapshot', type: 'json', value: JSON.stringify(intakeItem.catalog_snapshot) });
    if (intakeItem.psa_snapshot) metafields.push({ namespace: 'acs.sync', key: 'psa_snapshot', type: 'json', value: JSON.stringify(intakeItem.psa_snapshot) });
    if (intakeItem.grading_data) metafields.push({ namespace: 'acs.sync', key: 'grading_data', type: 'json', value: JSON.stringify(intakeItem.grading_data) });
    if (purchaseLocation) metafields.push({ namespace: 'acs.sync', key: 'purchase_location', type: 'single_line_text_field', value: purchaseLocation });

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

    // Add tags metafield
    metafields.push({
      namespace: 'acs.sync',
      key: 'tags',
      type: 'list.single_line_text_field',
      value: JSON.stringify(tagsArray)
    });

    // ── Resolve front image ──
    const frontUrl = determineFrontImageUrl(intakeItem);
    const resolvedImageUrl = frontUrl || imageUrl || 
      (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 
        ? intakeItem.image_urls[0] : null);

    // ── Intended variant data ──
    const intendedVariant = {
      sku: item.sku,
      price: item.price?.toString() || '0.00',
      cost: item.cost ? item.cost.toString() : (intakeItem.cost ? intakeItem.cost.toString() : undefined),
      inventory_management: 'shopify',
      requires_shipping: true,
      taxable: true,
      barcode: generateBarcodeForGradedItem(item, intakeItem),
      inventory_policy: 'deny',
      weight: isComic ? 1.5 : (intakeItem.product_weight || 3.5),
      weight_unit: isComic ? 'lb' : 'oz'
    }

    // ── Intended product-level fields ──
    const intendedProduct = {
      title,
      body_html: description,
      vendor: vendor || brandTitle || (isComic ? 'Comics' : 'Trading Cards'),
      product_type: isComic ? 'Graded Comic' : 'Graded Card',
      tags: tagsArray.join(', ')
    }

    let product: any, variant: any, shopifyResponse: any
    let apiCallCount = 0

    if (isUpdate) {
      // ── UPDATE PATH: fetch existing product first, then diff ──
      const fetchTimer = timer()
      const existingRes = await shopifyFetchWithRetry(
        `https://${domain}/admin/api/2024-07/products/${existingProductId}.json`,
        { method: 'GET', headers: shopifyHeaders }
      )
      apiCallCount++

      if (!existingRes.ok) {
        const errorText = await existingRes.text()
        throw new Error(`Failed to fetch existing Shopify product: ${errorText}`)
      }

      const existingData = await existingRes.json()
      const existingProduct = existingData.product
      console.log(JSON.stringify({ event: 'shopify_sync_timing', stage: 'product_fetch', duration_ms: fetchTimer() }))

      // ── Diff product fields ──
      const productDiff = buildUpdateDiff(existingProduct, intendedProduct)
      
      if (productDiff) {
        const updateTimer = timer()
        const updateResponse = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/products/${existingProductId}.json`,
          { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ product: { id: existingProductId, ...productDiff } }) }
        )
        apiCallCount++

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          throw new Error(`Failed to update Shopify product: ${errorText}`)
        }

        const updateResult = await updateResponse.json()
        shopifyResponse = updateResult
        product = updateResult.product
        console.log(JSON.stringify({ event: 'shopify_sync_timing', stage: 'product_update', duration_ms: updateTimer(), fields_changed: Object.keys(productDiff) }))
      } else {
        product = existingProduct
        shopifyResponse = existingData
        console.log(JSON.stringify({ event: 'shopify_sync_skip', stage: 'product_update', reason: 'no_changes' }))
      }

      variant = product.variants.find((v: any) => v.id.toString() === existingVariantId) || product.variants[0]

      // ── Diff variant fields ──
      const variantDiff = buildVariantDiff(variant, intendedVariant)

      if (variantDiff) {
        const variantTimer = timer()
        const variantUpdateResponse = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/variants/${variant.id}.json`,
          { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ variant: variantDiff }) }
        )
        apiCallCount++

        if (!variantUpdateResponse.ok) {
          const errorText = await variantUpdateResponse.text()
          console.warn(`Failed to update variant: ${errorText}`)
        } else {
          console.log(JSON.stringify({ event: 'shopify_sync_timing', stage: 'variant_update', duration_ms: variantTimer(), fields_changed: Object.keys(variantDiff).filter(k => k !== 'id') }))
        }
      } else {
        console.log(JSON.stringify({ event: 'shopify_sync_skip', stage: 'variant_update', reason: 'no_changes' }))
      }

      // ── Skip image re-upload if front image already correct ──
      if (resolvedImageUrl && !productHasCorrectImage(existingProduct, resolvedImageUrl)) {
        console.log(`[FRONT-ONLY] Image changed, triggering media order for: ${resolvedImageUrl}`)
        const mediaResult = await ensureMediaOrder({ domain, token, productId: product.id.toString(), intendedFrontUrl: resolvedImageUrl })
        apiCallCount++
        if (!mediaResult.success) console.warn(`[MEDIA ORDER] ${mediaResult.message}`)
      } else {
        console.log(JSON.stringify({ event: 'shopify_sync_skip', stage: 'image_upload', reason: resolvedImageUrl ? 'image_unchanged' : 'no_image' }))
      }

    } else {
      // ── CREATE PATH ──
      const createTimer = timer()

      // Build full product payload for create (includes image + variant)
      const createPayload = {
        product: {
          ...intendedProduct,
          variants: [{ ...intendedVariant, inventory_quantity: 1 }],
          images: resolvedImageUrl ? [{ src: resolvedImageUrl, alt: title, position: 1 }] : []
        }
      }

      if (resolvedImageUrl) {
        console.log(`[FRONT-ONLY] Sending single image to Shopify: ${resolvedImageUrl}`)
      }

      const createResponse = await shopifyFetchWithRetry(
        `https://${domain}/admin/api/2024-07/products.json`,
        { method: 'POST', headers: shopifyHeaders, body: JSON.stringify(createPayload) }
      )
      apiCallCount++

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        throw new Error(`Failed to create Shopify product: ${errorText}`)
      }

      const result = await createResponse.json()
      shopifyResponse = result
      product = result.product
      variant = product.variants[0]
      console.log(JSON.stringify({ event: 'shopify_sync_timing', stage: 'product_create', duration_ms: createTimer() }))

      // Ensure front image is featured (safety net for create)
      if (frontUrl) {
        const mediaResult = await ensureMediaOrder({ domain, token, productId: product.id.toString(), intendedFrontUrl: frontUrl })
        apiCallCount++
        if (!mediaResult.success) console.warn(`[MEDIA ORDER] ${mediaResult.message}`)
      }
    }

    // ── Inventory write: only on CREATE ──
    if (!isUpdate) {
      const invTimer = timer()
      const requestId = generateRequestId('send-graded')
      const locationId = locationGidToId(locationGid)
      
      const inventoryResult = await writeInventory({
        domain,
        token,
        inventory_item_id: String(variant.inventory_item_id),
        location_id: locationId,
        action: 'initial_set',
        quantity: 1,
        request_id: requestId,
        store_key: storeKey,
        item_id: item.id,
        sku: item.sku,
        source_function: 'v2-shopify-send-graded',
        triggered_by: user.id,
        supabase
      })
      apiCallCount++

      if (!inventoryResult.success) {
        console.warn(`Failed to set inventory level: ${inventoryResult.error}`)
      }
      console.log(JSON.stringify({ event: 'shopify_sync_timing', stage: 'inventory_set', duration_ms: invTimer() }))
    } else {
      console.log(`[INVENTORY] Skipping inventory write for update (product ${product.id}) to prevent reset`)
    }

    // ── Metafield sync: fetch existing on update to skip unchanged, batch where possible ──
    const metafieldTimer = timer()
    let metafieldsToWrite = metafields

    if (isUpdate) {
      // Fetch existing metafields in one call
      try {
        const existingMfRes = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`,
          { method: 'GET', headers: shopifyHeaders }
        )
        apiCallCount++

        if (existingMfRes.ok) {
          const { metafields: existingMfs } = await existingMfRes.json()
          metafieldsToWrite = filterChangedMetafields(metafields, existingMfs || [])
          
          const skipped = metafields.length - metafieldsToWrite.length
          if (skipped > 0) {
            console.log(JSON.stringify({ event: 'shopify_sync_skip', stage: 'metafields', reason: 'unchanged', skipped_count: skipped, writing_count: metafieldsToWrite.length }))
          }
        }
      } catch (mfFetchErr) {
        console.warn('[METAFIELDS] Failed to fetch existing, will write all:', mfFetchErr)
      }
    }

    // Write metafields — batch in parallel groups of 5 to stay within rate limits
    const BATCH_SIZE = 5
    let metafieldSuccessCount = 0
    let metafieldFailCount = 0

    for (let i = 0; i < metafieldsToWrite.length; i += BATCH_SIZE) {
      const batch = metafieldsToWrite.slice(i, i + BATCH_SIZE)
      
      const results = await Promise.allSettled(
        batch.map(metafield =>
          shopifyFetchWithRetry(
            `https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`,
            { method: 'POST', headers: shopifyHeaders, body: JSON.stringify({ metafield }) }
          ).then(async res => {
            apiCallCount++
            if (!res.ok) {
              const errorText = await res.text()
              console.warn(`Failed to create metafield ${metafield.namespace}.${metafield.key}: ${errorText}`)
              return false
            }
            return true
          })
        )
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) metafieldSuccessCount++
        else metafieldFailCount++
      }
    }

    console.log(JSON.stringify({
      event: 'shopify_sync_timing',
      stage: 'metafields',
      duration_ms: metafieldTimer(),
      total: metafields.length,
      written: metafieldSuccessCount,
      skipped: metafields.length - metafieldsToWrite.length,
      failed: metafieldFailCount
    }))

    // ── Update intake item in DB ──
    const resolvedFrontUrl = determineFrontImageUrl(intakeItem) || intakeItem.image_url
    const shopifySnapshot = {
      product_data: { product: { ...intendedProduct, variants: [intendedVariant] } },
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
        image_urls: intakeItem.image_urls,
        image_url: resolvedFrontUrl,
        updated_by: 'shopify_sync'
      })
      .eq('id', item.id)

    if (updateError) {
      console.error('Failed to update intake item:', updateError)
    }

    const totalMs = totalTimer()

    // Structured logging: sync complete
    console.log(JSON.stringify({
      event: 'shopify_sync_complete',
      item_id: item.id,
      sku: item.sku,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      isUpdate,
      store: storeKey,
      api_calls: apiCallCount,
      total_duration_ms: totalMs
    }))

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      product_url: `https://${domain}/products/${product.handle}`,
      admin_url: `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/products/${product.id}`,
      psa_url_included: !!psaUrl,
      api_calls: apiCallCount,
      duration_ms: totalMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(JSON.stringify({
      event: 'shopify_sync_error',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
      total_duration_ms: totalTimer()
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
