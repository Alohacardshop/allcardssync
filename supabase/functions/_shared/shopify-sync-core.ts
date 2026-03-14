import { writeInventory, generateRequestId, locationGidToId } from './inventory-write.ts'
import { ensureMediaOrder, determineFrontImageUrl } from './shopify-media-order.ts'

// ── Timing helper ──
export function timer() {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

/**
 * Retry wrapper for Shopify API calls.
 * Up to 4 attempts: immediate → 1s → 2s → 4s
 */
export async function shopifyFetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
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
      
      if (attempt >= maxRetries) return response
    } catch (err) {
      console.warn(`[RETRY] Network error for ${url} (attempt ${attempt + 1}/${maxRetries + 1}):`, err)
      if (attempt >= maxRetries) throw err
    }
  }

  throw new Error(`[RETRY] Exhausted all retries for ${url}`)
}

export function generateBarcodeForGradedItem(item: any, intakeItem: any): string {
  const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number;
  if (psaCert) return psaCert;
  const cgcCert = intakeItem.cgc_cert || intakeItem.catalog_snapshot?.cgc_cert;
  if (cgcCert) return cgcCert;
  return item.sku || intakeItem.sku || '';
}

export function deduplicateParts(parts: string[]): string[] {
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

export function buildUpdateDiff(existing: any, intended: any): any | null {
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

export function buildVariantDiff(existing: any, intended: any): any | null {
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

export function productHasCorrectImage(existingProduct: any, intendedImageUrl: string): boolean {
  if (!existingProduct?.images?.length || !intendedImageUrl) return false
  const firstImage = existingProduct.images[0]
  const intendedFilename = intendedImageUrl.split('/').pop()?.split('?')[0] || ''
  const existingSrc = firstImage.src || ''
  if (firstImage.position === 1 && intendedFilename && existingSrc.includes(intendedFilename)) {
    return true
  }
  return false
}

export function filterChangedMetafields(
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

// ── Comic helpers ──

const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
]

/** Parse "2025-11" or bare "2025" into structured month/year. Returns null for bad input. */
export function parsePublicationDate(dateStr?: string | null): { month: string; year: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) {
    const yearOnly = dateStr.trim().match(/^(\d{4})$/)
    if (yearOnly) return { month: '', year: yearOnly[1] }
    return null
  }
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return { month: MONTH_NAMES[monthIdx], year: m[1] }
}

/** Strip junk tokens like "NONE", "N/A", empty strings */
export function cleanVariant(v?: string | null): string {
  if (!v) return ''
  const cleaned = v.trim()
  if (/^(none|n\/a|na|-)$/i.test(cleaned)) return ''
  return cleaned
}

/** Format issue number — ensure # prefix, return '' for empty/whitespace/zero-only */
export function formatIssueNumber(num?: string | null): string {
  if (!num) return ''
  const n = num.toString().trim().replace(/^#/, '')
  if (!n || /^0+$/.test(n)) return ''
  return `#${n}`
}

/** Safely get a trimmed non-empty string from candidates, or '' */
function safeStr(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    if (v && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * Build a comic-specific Shopify title.
 * Format: PUBLISHER TITLE #ISSUE MONTH YEAR VARIANT
 * Gracefully handles missing fields — no dangling # or broken spacing.
 */
export function buildComicTitle(intakeItem: any, item: any): string {
  const snapshot = intakeItem?.catalog_snapshot || intakeItem?.psa_snapshot || {}

  const publisher = safeStr(snapshot.brandTitle, intakeItem?.brand_title, item?.brand_title)
  const comicName = safeStr(snapshot.subject, intakeItem?.subject, item?.subject)
  const issueNum = formatIssueNumber(snapshot.issueNumber || snapshot.cardNumber || intakeItem?.card_number || item?.card_number)
  const variant = cleanVariant(snapshot.varietyPedigree || intakeItem?.variant || item?.variant)
  const grade = safeStr(item?.grade, intakeItem?.grade)
  const gradingCompany = safeStr(intakeItem?.grading_company, item?.grading_company) || 'PSA'

  const pubDate = parsePublicationDate(snapshot.publicationDate || snapshot.year)

  const parts: string[] = []
  if (publisher) parts.push(publisher)
  if (comicName) parts.push(comicName)
  if (issueNum) parts.push(issueNum)
  if (pubDate) {
    if (pubDate.month) parts.push(pubDate.month)
    parts.push(pubDate.year)
  }
  if (variant) parts.push(variant)
  if (grade) parts.push(`${gradingCompany.toUpperCase()} ${grade}`)

  const deduped = deduplicateParts(parts.filter(Boolean))
  const raw = deduped.join(' ')
  return raw.replace(/\s{2,}/g, ' ').trim() || 'Graded Comic'
}

/**
 * Build a comic-specific Shopify description with labeled fields.
 * Gracefully skips missing fields — no empty rows or broken HTML.
 */
export function buildComicDescription(intakeItem: any, item: any): string {
  const snapshot = intakeItem?.catalog_snapshot || intakeItem?.psa_snapshot || {}
  const gradingCompany = intakeItem?.grading_company || 'PSA'
  const psaCert = safeStr(item?.psa_cert, intakeItem?.psa_cert, intakeItem?.psa_cert_number)
  const grade = safeStr(item?.grade, intakeItem?.grade)
  const publisher = safeStr(snapshot.brandTitle, intakeItem?.brand_title, item?.brand_title)
  const comicName = safeStr(snapshot.subject, intakeItem?.subject, item?.subject)
  const rawIssue = safeStr(snapshot.issueNumber, snapshot.cardNumber, intakeItem?.card_number, item?.card_number)
  const volumeNum = safeStr(snapshot.cardNumber, intakeItem?.card_number)
  const pubDate = safeStr(snapshot.publicationDate, snapshot.year, intakeItem?.year)
  const variant = cleanVariant(snapshot.varietyPedigree || intakeItem?.variant || item?.variant)
  const language = safeStr(snapshot.language)
  const country = safeStr(snapshot.country)
  const pageQuality = safeStr(snapshot.pageQuality)
  const category = safeStr(snapshot.category, intakeItem?.category, item?.category_tag)

  const psaUrl = intakeItem?.catalog_snapshot?.psaUrl ||
    intakeItem?.psa_snapshot?.psaUrl ||
    (psaCert ? `https://www.psacard.com/cert/${psaCert}` : null)

  const lines: string[] = []
  lines.push(`<strong>Graded Comic — ${gradingCompany}</strong>`)
  lines.push('')

  const addRow = (label: string, val: string) => {
    if (val) lines.push(`<strong>${label}:</strong> ${val}`)
  }

  addRow('Cert Number', psaCert)
  if (grade) addRow('Grade', `${gradingCompany} ${grade}`)
  addRow('Name', comicName)
  if (rawIssue) addRow('Issue', `#${rawIssue.replace(/^#/, '')}`)
  if (volumeNum && volumeNum !== rawIssue) addRow('Volume', volumeNum)
  addRow('Publication Date', pubDate)
  addRow('Publisher', publisher)
  addRow('Variant', variant)
  if (language && !/^english$/i.test(language)) addRow('Language', language)
  addRow('Country', country)
  addRow('Page Quality', pageQuality)
  addRow('Category', category)

  // PSA URL intentionally omitted — eBay prohibits external URLs in descriptions

  return lines.join('<br>')
}

/**
 * Build comic-specific metafields (appended to the standard set).
 */
export function buildComicMetafields(intakeItem: any, item: any): Array<{ namespace: string; key: string; type: string; value: string }> {
  const snapshot = intakeItem?.catalog_snapshot || intakeItem?.psa_snapshot || {}
  const fields: Array<{ namespace: string; key: string; type: string; value: string }> = []

  const add = (key: string, val?: string | null) => {
    if (val && typeof val === 'string' && val.trim()) {
      fields.push({ namespace: 'acs.comic', key, type: 'single_line_text_field', value: val.trim() })
    }
  }

  add('publisher', snapshot.brandTitle || intakeItem?.brand_title)
  add('comic_title', snapshot.subject || intakeItem?.subject)
  add('issue_number', snapshot.issueNumber || snapshot.cardNumber || intakeItem?.card_number)
  add('publication_date', snapshot.publicationDate || snapshot.year || intakeItem?.year)
  add('variant', cleanVariant(snapshot.varietyPedigree || intakeItem?.variant) || undefined)
  add('language', snapshot.language)
  add('country', snapshot.country)
  add('page_quality', snapshot.pageQuality)
  add('category', snapshot.category || intakeItem?.category)

  return fields
}

// ── Types ──

export interface SyncItemInput {
  id: string
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

export interface SyncContext {
  domain: string
  token: string
  storeKey: string
  locationGid: string
  vendor?: string
  userId: string
  supabase: any
}

export interface SyncResult {
  success: boolean
  item_id: string
  shopify_product_id?: string
  shopify_variant_id?: string
  error?: string
  api_calls: number
  duration_ms: number
}

/**
 * Core sync logic for a single graded item to Shopify.
 * Used by both single-item and bulk endpoints.
 */
export async function syncGradedItemToShopify(
  item: SyncItemInput,
  ctx: SyncContext
): Promise<SyncResult> {
  const totalTimer = timer()
  let apiCallCount = 0

  try {
    const { domain, token, storeKey, locationGid, vendor, userId, supabase } = ctx

    // Fetch intake item
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

    // ── Duplicate protection ──
    const hasExistingProduct = !!intakeItem.shopify_product_id
    const hasExistingVariant = !!intakeItem.shopify_variant_id
    const existingProductId = intakeItem.shopify_product_id
    const existingVariantId = intakeItem.shopify_variant_id
    const isUpdate = hasExistingProduct && hasExistingVariant

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

    // GUARD: Block create when product exists but variant linkage is missing
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
        `Aborting to prevent duplicate. Manual repair required.`
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

    const tagsForShopify = intakeItem.normalized_tags || intakeItem.shopify_tags || [];

    const psaUrl = intakeItem.catalog_snapshot?.psaUrl || 
                   intakeItem.psa_snapshot?.psaUrl || 
                   (intakeItem.psa_cert ? `https://www.psacard.com/cert/${intakeItem.psa_cert}` : null)

    const imageUrl = intakeItem.psa_snapshot?.image_url ||
                     intakeItem.image_url ||
                     item.image_url ||
                     intakeItem.catalog_snapshot?.image_url ||
                     (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 ? 
                       intakeItem.image_urls[0] : null)

    const shopifyHeaders = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }

    // ── Detect comic ──
    const isComic = intakeItem.main_category === 'comics' || intakeItem.catalog_snapshot?.type === 'graded_comic'

    // ── Build title, description, tags ──
    const year = item.year || intakeItem.year || intakeItem.catalog_snapshot?.year || intakeItem.psa_snapshot?.year || ''
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

    const psaCert = item.psa_cert || intakeItem.psa_cert || intakeItem.psa_cert_number

    let title = item.title
    let description: string

    if (isComic) {
      // ── Comic-specific title & description ──
      if (!title) {
        title = buildComicTitle(intakeItem, item)
      }
      description = buildComicDescription(intakeItem, item)
    } else {
      // ── Generic graded card title & description ──
      if (!title) {
        const parts = []
        if (year) parts.push(year)
        if (brandTitle) parts.push(brandTitle)
        if (subject) parts.push(subject)
        if (cardNumber) parts.push(`#${cardNumber}`)
        if (cardVariant) parts.push(cardVariant)
        if (grade) parts.push(`${gradingCompany} ${grade}`)
        
        const cleanedParts = deduplicateParts(parts.filter(Boolean))
        title = cleanedParts.join(' ')
      }

      // HTML description matching comic description format
      const descLines: string[] = []
      descLines.push(`<strong>Graded Card — ${gradingCompany}</strong><br>`)
      if (psaCert) descLines.push(`<strong>Cert Number:</strong> ${psaCert}<br>`)
      if (grade) descLines.push(`<strong>Grade:</strong> ${gradingCompany} ${grade}<br>`)
      if (subject) descLines.push(`<strong>Subject:</strong> ${subject}<br>`)
      if (brandTitle) descLines.push(`<strong>Brand:</strong> ${brandTitle}<br>`)
      if (year) descLines.push(`<strong>Year:</strong> ${year}<br>`)
      if (cardNumber) descLines.push(`<strong>Card #:</strong> #${cardNumber}<br>`)
      if (cardVariant) descLines.push(`<strong>Variant:</strong> ${cardVariant}<br>`)
      description = descLines.join('')
    }

    // ── Metafields ──
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

    // Comic-specific metafields under acs.comic namespace
    if (isComic) {
      metafields.push(...buildComicMetafields(intakeItem, item))
    }

    const additionalTags = [
      gradingCompany,
      grade ? `Grade ${grade}` : null,
      vendor,
      purchaseLocation ? `Purchased: ${purchaseLocation}` : null
    ].filter(Boolean);

    // Merge normalized_tags from DB trigger
    const normalizedTags = Array.isArray(intakeItem.normalized_tags) ? intakeItem.normalized_tags : [];

    const rawTagsArray = [...new Set([
      ...tagsForShopify,
      ...additionalTags,
      ...normalizedTags,
      isComic ? 'comics' : 'card',
      'graded',
      intakeItem.primary_category,
      intakeItem.condition_type
    ].filter(Boolean))];

    // Sanitize contradictory tags
    const COMIC_EXCLUDE = new Set(['card', 'Raw Card', 'single']);
    const CARD_EXCLUDE = new Set(['comics']);
    const tagsArray = rawTagsArray.filter(tag =>
      isComic ? !COMIC_EXCLUDE.has(tag) : !CARD_EXCLUDE.has(tag)
    );

    metafields.push({
      namespace: 'acs.sync', key: 'tags', type: 'list.single_line_text_field',
      value: JSON.stringify(tagsArray)
    });

    // ── Resolve front image ──
    const frontUrl = determineFrontImageUrl(intakeItem);
    const resolvedImageUrl = frontUrl || imageUrl || 
      (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0 
        ? intakeItem.image_urls[0] : null);

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

    const intendedProduct = {
      title,
      body_html: description,
      vendor: vendor || brandTitle || (isComic ? 'Comics' : 'Trading Cards'),
      product_type: isComic ? 'Graded Comic' : 'Graded Card',
      tags: tagsArray.join(', ')
    }

    let product: any, variant: any, shopifyResponse: any

    if (isUpdate) {
      // ── UPDATE PATH ──
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

      const productDiff = buildUpdateDiff(existingProduct, intendedProduct)
      
      if (productDiff) {
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
      } else {
        product = existingProduct
        shopifyResponse = existingData
        console.log(JSON.stringify({ event: 'shopify_sync_skip', stage: 'product_update', reason: 'no_changes', item_id: item.id }))
      }

      variant = product.variants.find((v: any) => v.id.toString() === existingVariantId) || product.variants[0]

      const variantDiff = buildVariantDiff(variant, intendedVariant)
      if (variantDiff) {
        const variantUpdateResponse = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/variants/${variant.id}.json`,
          { method: 'PUT', headers: shopifyHeaders, body: JSON.stringify({ variant: variantDiff }) }
        )
        apiCallCount++
        if (!variantUpdateResponse.ok) {
          const errorText = await variantUpdateResponse.text()
          console.warn(`Failed to update variant: ${errorText}`)
        }
      }

      if (resolvedImageUrl && !productHasCorrectImage(existingProduct, resolvedImageUrl)) {
        const mediaResult = await ensureMediaOrder({ domain, token, productId: product.id.toString(), intendedFrontUrl: resolvedImageUrl })
        apiCallCount++
        if (!mediaResult.success) console.warn(`[MEDIA ORDER] ${mediaResult.message}`)
      }

    } else {
      // ── CREATE PATH ──
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

      if (frontUrl) {
        const mediaResult = await ensureMediaOrder({ domain, token, productId: product.id.toString(), intendedFrontUrl: frontUrl })
        apiCallCount++
        if (!mediaResult.success) console.warn(`[MEDIA ORDER] ${mediaResult.message}`)
      }
    }

    // ── Inventory write: only on CREATE ──
    if (!isUpdate) {
      const requestId = generateRequestId('send-graded')
      const locationId = locationGidToId(locationGid)
      
      const inventoryResult = await writeInventory({
        domain, token,
        inventory_item_id: String(variant.inventory_item_id),
        location_id: locationId,
        action: 'initial_set',
        quantity: 1,
        request_id: requestId,
        store_key: storeKey,
        item_id: item.id,
        sku: item.sku,
        source_function: 'v2-shopify-send-graded',
        triggered_by: userId,
        supabase
      })
      apiCallCount++

      if (!inventoryResult.success) {
        console.warn(`Failed to set inventory level: ${inventoryResult.error}`)
      }
    } else {
      console.log(`[INVENTORY] Skipping inventory write for update (product ${product.id}) to prevent reset`)
    }

    // ── Metafield sync ──
    let metafieldsToWrite = metafields

    if (isUpdate) {
      try {
        const existingMfRes = await shopifyFetchWithRetry(
          `https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`,
          { method: 'GET', headers: shopifyHeaders }
        )
        apiCallCount++

        if (existingMfRes.ok) {
          const { metafields: existingMfs } = await existingMfRes.json()
          metafieldsToWrite = filterChangedMetafields(metafields, existingMfs || [])
        }
      } catch (mfFetchErr) {
        console.warn('[METAFIELDS] Failed to fetch existing, will write all:', mfFetchErr)
      }
    }

    // Write metafields in parallel batches of 5
    const BATCH_SIZE = 5
    for (let i = 0; i < metafieldsToWrite.length; i += BATCH_SIZE) {
      const batch = metafieldsToWrite.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(metafield =>
          shopifyFetchWithRetry(
            `https://${domain}/admin/api/2024-07/products/${product.id}/metafields.json`,
            { method: 'POST', headers: shopifyHeaders, body: JSON.stringify({ metafield }) }
          ).then(async res => {
            apiCallCount++
            if (!res.ok) {
              const errorText = await res.text()
              console.warn(`Failed to create metafield ${metafield.namespace}.${metafield.key}: ${errorText}`)
            }
          })
        )
      )
    }

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
        front_image_url: intakeItem.front_image_url || (Array.isArray(intakeItem.image_urls) ? intakeItem.image_urls[0] : null),
        back_image_url: intakeItem.back_image_url || (Array.isArray(intakeItem.image_urls) ? intakeItem.image_urls[1] : null),
        updated_by: 'shopify_sync'
      })
      .eq('id', item.id)

    if (updateError) {
      console.error('Failed to update intake item:', updateError)
    }

    const totalMs = totalTimer()

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

    return {
      success: true,
      item_id: item.id,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      api_calls: apiCallCount,
      duration_ms: totalMs
    }

  } catch (error) {
    const totalMs = totalTimer()
    console.error(JSON.stringify({
      event: 'shopify_sync_error',
      item_id: item.id,
      error: error.message,
      total_duration_ms: totalMs
    }))

    return {
      success: false,
      item_id: item.id,
      error: error.message,
      api_calls: apiCallCount,
      duration_ms: totalMs
    }
  }
}
