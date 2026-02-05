import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 import { writeInventory, generateRequestId } from '../_shared/inventory-write.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncQueueItem {
  id: string
  inventory_item_id: string
  action: 'create' | 'update' | 'delete'
  status: string
  retry_count: number
  max_retries: number
}

interface InventoryItem {
  id: string
  store_key: string
  shopify_location_gid: string
  sku: string
  brand_title: string
  subject: string
  category: string
  variant: string
  card_number: string
  grade: string
  price: number
  quantity: number
  type: 'Graded' | 'Raw'
  psa_cert: string
  cgc_cert?: string
  grading_company?: string
  year?: string
  cost?: number
  shopify_product_id?: string
  shopify_variant_id?: string
  catalog_snapshot?: any
}

interface ShopifyCredentials {
  domain: string
  access_token: string
}

// Helper function to get barcode for items
// Priority: Certificate number (PSA/CGC) > TCGPlayer ID > SKU
function getItemBarcode(item: InventoryItem): string | undefined {
  // For graded items, use certificate number
  if (item.type === 'Graded') {
    if (item.psa_cert) return item.psa_cert;
    if (item.cgc_cert) return item.cgc_cert;
  }
  
  // For raw items, use TCGPlayer ID if available
  const tcgPlayerId = item.catalog_snapshot?.tcgplayer_id;
  if (tcgPlayerId) return tcgPlayerId;
  
  // Fallback to SKU
  return item.sku || undefined;
}

// Rate limiting state
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 750 // 750ms between requests (reduced from 500ms)
const RATE_LIMIT_BACKOFF_BASE = 2000 // Base delay for rate limit backoff

async function rateLimitDelay() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delayNeeded = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    await new Promise(resolve => setTimeout(resolve, delayNeeded))
  }
  lastRequestTime = Date.now()
}

// Sleep utility for delays
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function handleRateLimitError(response: Response, retryCount: number = 0): Promise<number> {
  // Parse retry-after header (can be in seconds or HTTP date)
  const retryAfter = response.headers.get('retry-after')
  let delayMs = RATE_LIMIT_BACKOFF_BASE * Math.pow(2, retryCount) // Exponential backoff
  
  if (retryAfter) {
    const retrySeconds = parseInt(retryAfter)
    if (!isNaN(retrySeconds)) {
      delayMs = Math.max(delayMs, retrySeconds * 1000)
    }
  }
  
  console.log(`🚫 Rate limited. Waiting ${delayMs}ms before retry (attempt ${retryCount + 1})`)
  await new Promise(resolve => setTimeout(resolve, delayMs))
  return delayMs
}

async function getShopifyCredentials(supabase: any, storeKey: string): Promise<ShopifyCredentials> {
  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('domain')
    .eq('key', storeKey)
    .single()
  
  if (error || !store) {
    throw new Error(`Store not found: ${storeKey}`)
  }

  // Get access token from system settings - use correct key format
  const { data: tokenSetting, error: tokenError } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`)
    .single()
  
  if (tokenError || !tokenSetting) {
    console.error(`Failed to get access token for ${storeKey}:`, tokenError)
    throw new Error(`Access token not found for store: ${storeKey}`)
  }

  return {
    domain: store.domain,
    access_token: tokenSetting.key_value
  }
}

async function shopifyRequest(credentials: ShopifyCredentials, endpoint: string, options: RequestInit = {}, retryCount: number = 0): Promise<any> {
  const maxRetries = 3
  
  await rateLimitDelay()
  
  const url = `https://${credentials.domain}/admin/api/2024-10/${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': credentials.access_token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  })

  // Handle rate limiting with smart retry
  if (response.status === 429 && retryCount < maxRetries) {
    await handleRateLimitError(response, retryCount)
    return shopifyRequest(credentials, endpoint, options, retryCount + 1)
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Shopify API error: ${response.status} - ${errorText}`)
    
    // Categorize the error
    const errorType = response.status === 429 ? 'RATE_LIMIT' : 
                     response.status >= 500 ? 'SERVER_ERROR' : 
                     response.status === 404 ? 'NOT_FOUND' : 'CLIENT_ERROR'
    
    const error = new Error(`Shopify API error: ${response.status} - ${errorText}`)
    ;(error as any).type = errorType
    ;(error as any).status = response.status
    throw error
  }

  const responseText = await response.text()
  try {
    return JSON.parse(responseText)
  } catch (parseError) {
    console.error('Failed to parse Shopify response:', responseText)
    throw new Error(`Invalid JSON response from Shopify: ${responseText}`)
  }
}

// Check local cache first for faster lookups
async function checkProductCache(supabase: any, sku: string, storeKey: string): Promise<{ shopify_product_id: string; shopify_variant_id: string; shopify_inventory_item_id: string } | null> {
  const { data, error } = await supabase
    .from('shopify_product_cache')
    .select('shopify_product_id, shopify_variant_id, shopify_inventory_item_id')
    .eq('sku', sku)
    .eq('store_key', storeKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  
  if (error || !data) return null
  return data
}

// Update product cache
async function updateProductCache(supabase: any, sku: string, storeKey: string, productId: string, variantId: string, inventoryItemId: string): Promise<void> {
  await supabase
    .from('shopify_product_cache')
    .upsert({
      sku,
      store_key: storeKey,
      shopify_product_id: productId,
      shopify_variant_id: variantId,
      shopify_inventory_item_id: inventoryItemId,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'sku,store_key' })
}

// Optimized product lookup using GraphQL for single-call SKU search
async function findExistingProduct(credentials: ShopifyCredentials, sku: string, title?: string, supabase?: any, storeKey?: string) {
  console.log(`🔍 Searching for existing product with SKU: ${sku}`)
  
  // Phase 2 optimization: Check local cache first
  if (supabase && storeKey) {
    const cached = await checkProductCache(supabase, sku, storeKey)
    if (cached) {
      console.log(`✅ Found in cache: product ${cached.shopify_product_id}, variant ${cached.shopify_variant_id}`)
      return { 
        product: { id: cached.shopify_product_id }, 
        variant: { id: cached.shopify_variant_id, inventory_item_id: cached.shopify_inventory_item_id },
        fromCache: true
      }
    }
  }
  
  // Optimized: Use GraphQL for efficient single-call SKU lookup
  try {
    const graphqlQuery = `
      query findProductBySKU($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
              }
              product {
                id
                title
                handle
              }
            }
          }
        }
      }
    `
    
    const graphqlUrl = `https://${credentials.domain}/admin/api/2024-10/graphql.json`
    await rateLimitDelay()
    
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': credentials.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: { query: `sku:${sku}` }
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      const edges = result?.data?.productVariants?.edges
      
      if (edges && edges.length > 0) {
        const node = edges[0].node
        const productGid = node.product.id
        const variantGid = node.id
        const inventoryItemGid = node.inventoryItem?.id
        
        // Extract numeric IDs from GIDs
        const productId = productGid.split('/').pop()
        const variantId = variantGid.split('/').pop()
        const inventoryItemId = inventoryItemGid?.split('/').pop()
        
        console.log(`✅ Found existing product via GraphQL: ${productId}, variant: ${variantId}`)
        
        // Cache the result
        if (supabase && storeKey && inventoryItemId) {
          await updateProductCache(supabase, sku, storeKey, productId, variantId, inventoryItemId)
        }
        
        return { 
          product: { id: productId, title: node.product.title, handle: node.product.handle }, 
          variant: { id: variantId, sku: node.sku, inventory_item_id: inventoryItemId }
        }
      }
    }
  } catch (error) {
    console.log(`⚠️ GraphQL SKU search failed, falling back to REST: ${error}`)
  }
  
  // Fallback: REST API search by handle (single call)
  const handle = sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
  try {
    const products = await shopifyRequest(credentials, `products.json?limit=1&fields=id,title,variants&handle=${handle}`)
    if (products.products && products.products.length > 0) {
      const product = products.products[0]
      const variant = product.variants[0]
      console.log(`✅ Found existing product by handle: ${product.id}, variant: ${variant.id}`)
      
      // Cache the result
      if (supabase && storeKey && variant.inventory_item_id) {
        await updateProductCache(supabase, sku, storeKey, product.id.toString(), variant.id.toString(), variant.inventory_item_id.toString())
      }
      
      return { product, variant }
    }
  } catch (error) {
    console.log(`⚠️ Handle search failed: ${error}`)
  }

  // Debug log instead of warning for expected "not found" case
  console.log(`ℹ️ No existing product found for SKU: ${sku} (will create new)`)
  return { product: null, variant: null }
}

async function createShopifyProduct(credentials: ShopifyCredentials, item: InventoryItem) {
  // Different title formatting for graded vs raw cards
  let title: string
  let description: string
  let tags: string[] = []
  
  if (item.type === 'Graded') {
    // For graded cards: "2022 POKEMON GO FA/MEWTWO VSTAR #079 SHADOWLESS PSA 8"
    const cardNumber = item.card_number ? `#${item.card_number}` : ''
    
    // Try to get year from various sources including catalog_snapshot
    let year = item.year || ''
    if (!year && (item as any).catalog_snapshot && typeof (item as any).catalog_snapshot === 'object') {
      year = (item as any).catalog_snapshot.year || ''
    }
    
    // Handle variant - include meaningful variants in the title
    let variant = item.variant || ''
    if (variant && variant !== 'Normal' && variant !== 'Default' && variant !== '') {
      // Keep variants like SHADOWLESS, FIRST EDITION, etc.
      variant = variant.toUpperCase()
    } else {
      variant = ''
    }
    
    const parts = []
    if (year) parts.push(year)
    if (item.brand_title) parts.push(item.brand_title)
    if (item.subject) parts.push(item.subject)
    if (cardNumber) parts.push(cardNumber)
    if (variant) parts.push(variant)
    if (item.grade) parts.push(`PSA ${item.grade}`)
    
    title = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    
    // Get PSA cert number for description
    const psaCertNumber = (item as any).psa_cert || (item as any).catalog_snapshot?.certNumber || (item as any).catalog_snapshot?.psa_cert || item.sku
    description = `${title}\nPSA Cert: ${psaCertNumber}`
    
    // Comprehensive tags for graded cards
    if (item.brand_title) tags.push(item.brand_title.toLowerCase())
    tags.push('graded', 'collectibles', 'trading-cards')
    if (item.grade) tags.push(`psa-${item.grade}`, `grade-${item.grade}`)
    if ((item as any).grading_company) tags.push((item as any).grading_company.toLowerCase())
    if (variant) tags.push(variant.toLowerCase())
    if (item.category) tags.push(item.category.toLowerCase().replace(/\s+/g, '-'))
    if (year) tags.push(`year-${year}`)
    if ((item as any).main_category) tags.push((item as any).main_category.toLowerCase())
    if ((item as any).sub_category) tags.push((item as any).sub_category.toLowerCase().replace(/\s+/g, '-'))
    if ((item as any).vendor) tags.push(`vendor-${(item as any).vendor.toLowerCase().replace(/\s+/g, '-')}`)
    if ((item as any).lot_number) tags.push(`lot-${(item as any).lot_number}`)
  } else {
    // For raw cards: keep simpler format but include variant if meaningful
    const cardNumber = item.card_number ? `#${item.card_number}` : ''
    let variant = item.variant || ''
    if (variant && variant !== 'Normal' && variant !== 'Default' && variant !== '') {
      variant = variant.toUpperCase()
    } else {
      variant = ''
    }
    
    const parts = []
    if (item.brand_title) parts.push(item.brand_title)
    if (item.subject) parts.push(item.subject)
    if (cardNumber) parts.push(cardNumber)
    if (variant) parts.push(variant)
    
    title = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    
    // Get PSA cert number for description (fallback to SKU for raw cards)
    const psaCertNumber = (item as any).psa_cert || (item as any).catalog_snapshot?.certNumber || (item as any).catalog_snapshot?.psa_cert || item.sku
    description = `${title}\nSKU: ${psaCertNumber}`
    
    // Comprehensive tags for raw cards
    if (item.brand_title) tags.push(item.brand_title.toLowerCase())
    tags.push('raw', 'ungraded', 'collectibles', 'trading-cards')
    if (variant) tags.push(variant.toLowerCase())
    if (item.category) tags.push(item.category.toLowerCase().replace(/\s+/g, '-'))
    if (item.year) tags.push(`year-${item.year}`)
    if ((item as any).main_category) tags.push((item as any).main_category.toLowerCase())
    if ((item as any).sub_category) tags.push((item as any).sub_category.toLowerCase().replace(/\s+/g, '-'))
    if ((item as any).vendor) tags.push(`vendor-${(item as any).vendor.toLowerCase().replace(/\s+/g, '-')}`)
    if ((item as any).lot_number) tags.push(`lot-${(item as any).lot_number}`)
  }
  
  // Extract image URLs from various sources
  const imageUrls = []
  
  // Check item.image_urls array
  if ((item as any).image_urls && Array.isArray((item as any).image_urls)) {
    imageUrls.push(...(item as any).image_urls)
  }
  
  // Check catalog_snapshot for images
  if ((item as any).catalog_snapshot && typeof (item as any).catalog_snapshot === 'object') {
    if ((item as any).catalog_snapshot.imageUrls && Array.isArray((item as any).catalog_snapshot.imageUrls)) {
      imageUrls.push(...(item as any).catalog_snapshot.imageUrls)
    }
    if ((item as any).catalog_snapshot.imageUrl && typeof (item as any).catalog_snapshot.imageUrl === 'string') {
      imageUrls.push((item as any).catalog_snapshot.imageUrl)
    }
  }
  
  // Remove duplicates and create Shopify images array
  const uniqueImageUrls = [...new Set(imageUrls)].filter(url => url && typeof url === 'string')
  
  // Add default image if no images found
  if (uniqueImageUrls.length === 0) {
    const defaultImageUrl = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png'
    uniqueImageUrls.push(defaultImageUrl)
  }
  
  const images = [...uniqueImageUrls].reverse().map((url, index) => ({
    src: url,
    alt: `${title} - Image ${index + 1}`
  }))
  
  const handle = item.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  // Build comprehensive metafields for structured data
  const metafields = []
  
  // Card identification metafields
  if (item.card_number) {
    metafields.push({
      namespace: 'card_info',
      key: 'card_number',
      value: item.card_number,
      type: 'single_line_text_field'
    })
  }
  
  if (item.year) {
    metafields.push({
      namespace: 'card_info',
      key: 'year',
      value: item.year,
      type: 'single_line_text_field'
    })
  }
  
  if (item.brand_title) {
    metafields.push({
      namespace: 'card_info',
      key: 'brand',
      value: item.brand_title,
      type: 'single_line_text_field'
    })
  }
  
  if (item.subject) {
    metafields.push({
      namespace: 'card_info',
      key: 'subject',
      value: item.subject,
      type: 'single_line_text_field'
    })
  }
  
  // Category metafields
  if ((item as any).main_category) {
    metafields.push({
      namespace: 'taxonomy',
      key: 'main_category',
      value: (item as any).main_category,
      type: 'single_line_text_field'
    })
  }
  
  if ((item as any).sub_category) {
    metafields.push({
      namespace: 'taxonomy',
      key: 'sub_category',
      value: (item as any).sub_category,
      type: 'single_line_text_field'
    })
  }
  
  // Grading metafields
  if (item.type === 'Graded') {
    if (item.grade) {
      metafields.push({
        namespace: 'grading',
        key: 'grade',
        value: item.grade,
        type: 'single_line_text_field'
      })
    }
    
    if ((item as any).grading_company) {
      metafields.push({
        namespace: 'grading',
        key: 'company',
        value: (item as any).grading_company,
        type: 'single_line_text_field'
      })
    }
    
    if (item.psa_cert) {
      metafields.push({
        namespace: 'grading',
        key: 'cert_number',
        value: item.psa_cert,
        type: 'single_line_text_field'
      })
    }
  }
  
  // Inventory tracking metafields
  if ((item as any).lot_number) {
    metafields.push({
      namespace: 'inventory',
      key: 'lot_number',
      value: (item as any).lot_number,
      type: 'single_line_text_field'
    })
  }
  
  if ((item as any).vendor) {
    metafields.push({
      namespace: 'inventory',
      key: 'vendor',
      value: (item as any).vendor,
      type: 'single_line_text_field'
    })
  }
  
  // Store full catalog snapshot as JSON for future reference
  if ((item as any).catalog_snapshot) {
    metafields.push({
      namespace: 'internal',
      key: 'catalog_snapshot',
      value: JSON.stringify((item as any).catalog_snapshot),
      type: 'json'
    })
  }
  
  const productData = {
    product: {
      title,
      body_html: description,
      handle,
      product_type: item.category,
      vendor: (item as any).vendor || 'aloha card shop hawaii',
      status: 'active',
      tags: tags.join(', '),
      images: images,
      metafields: metafields,
      variants: [{
        sku: item.sku,
        price: item.price.toString(),
        cost: item.cost ? item.cost.toString() : undefined,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        inventory_quantity: item.quantity,
        barcode: getItemBarcode(item),
        weight: 3,
        weight_unit: 'oz'
      }]
    }
  }

  console.log(`📦 Creating new product: ${title}`)
  console.log('DEBUG: Product data being sent to Shopify:', JSON.stringify(productData, null, 2))
  const result = await shopifyRequest(credentials, 'products.json', {
    method: 'POST',
    body: JSON.stringify(productData)
  })

  return {
    product: result.product,
    variant: result.product.variants[0]
  }
}

async function createProductVariant(credentials: ShopifyCredentials, productId: string, item: InventoryItem) {
  const variantData = {
    variant: {
      product_id: productId,
      sku: item.sku,
      price: item.price.toString(),
      cost: item.cost ? item.cost.toString() : undefined,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      inventory_quantity: item.quantity,
      barcode: getItemBarcode(item),
      option1: item.variant || 'Default',
      weight: 3, // 3oz as requested
      weight_unit: 'oz'
    }
  }

  console.log(`📦 Creating new variant for product: ${productId}`)
  const result = await shopifyRequest(credentials, `products/${productId}/variants.json`, {
    method: 'POST',
    body: JSON.stringify(variantData)
  })

  return result.variant
}

async function setInventoryLevel(credentials: ShopifyCredentials, inventoryItemId: string, locationId: string, quantity: number, supabase?: any, itemContext?: { item_id?: string; sku?: string; store_key?: string }) {
  console.log(`📊 Setting inventory: ${quantity} units at location ${locationId}`)
  
  const requestId = generateRequestId('shopify-sync')
  
  const result = await writeInventory({
    domain: credentials.domain,
    token: credentials.access_token,
    inventory_item_id: inventoryItemId,
    location_id: locationId,
    action: 'initial_set',
    quantity,
    request_id: requestId,
    store_key: itemContext?.store_key || 'unknown',
    item_id: itemContext?.item_id,
    sku: itemContext?.sku,
    source_function: 'shopify-sync',
    triggered_by: 'system',
    supabase
  })
  
  if (!result.success) {
    throw new Error(`Inventory set failed: ${result.error}`)
  }
}

async function deleteShopifyProduct(credentials: ShopifyCredentials, productId: string) {
  console.log(`🗑️ Deleting product: ${productId}`)
  
  await shopifyRequest(credentials, `products/${productId}.json`, {
    method: 'DELETE'
  })
}

async function processQueueItem(supabase: any, queueItem: SyncQueueItem) {
  console.log(`📦 Processing queue item: ${queueItem.id} (${queueItem.action})`)
  
  try {
    // Get inventory item details
    const { data: item, error: itemError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', queueItem.inventory_item_id)
      .single()
    
    if (itemError || !item) {
      throw new Error(`Inventory item not found: ${queueItem.inventory_item_id}`)
    }

    // Get Shopify credentials
    const credentials = await getShopifyCredentials(supabase, item.store_key)
    
    // Extract location ID from GID
    const locationId = item.shopify_location_gid.split('/').pop()
    
    let shopifyProductId = item.shopify_product_id
    let shopifyVariantId = item.shopify_variant_id
    let inventoryItemId = item.shopify_inventory_item_id

    if (queueItem.action === 'delete') {
      if (item.type === 'Graded' && shopifyProductId) {
        // Delete entire product for graded cards
        await deleteShopifyProduct(credentials, shopifyProductId)
      } else if (item.type === 'Raw' && shopifyVariantId && inventoryItemId) {
        // Reduce inventory to 0 for raw cards
        await setInventoryLevel(credentials, inventoryItemId, locationId, 0)
      }
      
      // Update item status
      await supabase
        .from('intake_items')
        .update({
          shopify_removed_at: new Date().toISOString(),
          shopify_sync_status: 'removed',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)
        
    } else {
      // Create or update
      let product = null
      let variant = null
      
      if (shopifyProductId && shopifyVariantId) {
        // Item already has Shopify IDs, just update inventory
        console.log(`🔄 Updating existing item: ${shopifyProductId}/${shopifyVariantId}`)
      } else {
        // Find or create product/variant (Phase 2: pass supabase and storeKey for caching)
        const existing = await findExistingProduct(credentials, item.sku, `${item.brand_title} ${item.subject} ${item.card_number}`.trim(), supabase, item.store_key)
        
        if (existing.variant) {
          // Product already exists - update variant price and inventory (skip if from cache)
          console.log(`🔄 Updating existing product: ${existing.product.id}, variant: ${existing.variant.id}`)
          
          // Only update variant if not from cache (cache entries already up-to-date)
          if (!existing.fromCache) {
            await shopifyRequest(credentials, `variants/${existing.variant.id}.json`, {
              method: 'PUT',
              body: JSON.stringify({
                variant: {
                  price: item.price.toString(),
                  cost: item.cost ? item.cost.toString() : undefined,
                }
              })
            })
          }
          
          product = existing.product
          variant = existing.variant
        } else {
          // No existing product found - wait and recheck to avoid race conditions
          console.log('⏳ No existing found, waiting 2s and rechecking to prevent duplicates...')
          await sleep(2000) // Give Shopify time to index any recently created products
          
          const recheck = await findExistingProduct(credentials, item.sku, `${item.brand_title} ${item.subject} ${item.card_number}`.trim(), supabase, item.store_key)
          if (recheck.variant) {
            console.log('✅ Found on recheck! Using existing product instead of creating duplicate')
            product = recheck.product
            variant = recheck.variant
          } else {
            // Still not found - safe to create new product
            console.log('🆕 Creating new Shopify product')
            const created = await createShopifyProduct(credentials, item)
            product = created.product
            variant = created.variant
          }
        }
        
        shopifyProductId = product.id.toString()
        shopifyVariantId = variant.id.toString()
        inventoryItemId = variant.inventory_item_id.toString()
      }
      
      // Set inventory level
      if (inventoryItemId && item.quantity > 0) {
        await setInventoryLevel(credentials, inventoryItemId, locationId, item.quantity)
      }
      
        // Update item with Shopify IDs and clear any previous errors
        await supabase
          .from('intake_items')
          .update({
            shopify_product_id: shopifyProductId,
            shopify_variant_id: shopifyVariantId,
            shopify_inventory_item_id: inventoryItemId,
            last_shopify_synced_at: new Date().toISOString(),
            shopify_sync_status: 'synced',
            last_shopify_sync_error: null,
            updated_at: new Date().toISOString(),
            updated_by: 'shopify_sync'
          })
          .eq('id', item.id)
    }
    
    // Mark queue item as completed
    await supabase
      .from('shopify_sync_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null
      })
      .eq('id', queueItem.id)
    
    console.log(`✅ Successfully processed queue item: ${queueItem.id}`)
    
  } catch (error) {
    console.error(`❌ Error processing queue item ${queueItem.id}:`, error)
    
    const errorType = (error as any).type || 'UNKNOWN'
    const shouldRetry = queueItem.retry_count < queueItem.max_retries
    
    // Calculate retry delay based on error type
    let retryDelayMs = 30000 // Default 30 seconds
    if (errorType === 'RATE_LIMIT') {
      retryDelayMs = RATE_LIMIT_BACKOFF_BASE * Math.pow(2, queueItem.retry_count)
    } else if (errorType === 'SERVER_ERROR') {
      retryDelayMs = 60000 * Math.pow(2, queueItem.retry_count) // Longer delay for server errors
    }
    
    const retryAfter = shouldRetry ? new Date(Date.now() + retryDelayMs) : null
    
    // Enhanced error message with categorization
    const errorMessage = `[${errorType}] Attempt ${queueItem.retry_count + 1}/${queueItem.max_retries}: ${error.message}`
    
    await supabase
      .from('shopify_sync_queue')
      .update({
        status: shouldRetry ? 'queued' : 'failed',
        retry_count: queueItem.retry_count + 1,
        retry_after: retryAfter?.toISOString(),
        error_message: errorMessage,
        error_type: errorType
      })
      .eq('id', queueItem.id)
    
    // Update inventory item with error
    await supabase
      .from('intake_items')
      .update({
        last_shopify_sync_error: error.message,
        shopify_sync_status: 'error',
        updated_at: new Date().toISOString()
      })
      .eq('id', queueItem.inventory_item_id)
    
    if (shouldRetry) {
      console.log(`🔄 Will retry queue item ${queueItem.id} in ${Math.floor(retryDelayMs / 1000)} seconds (${errorType})`)
    } else {
      console.log(`💀 Queue item ${queueItem.id} failed permanently after ${queueItem.retry_count} retries (${errorType})`)
      
      // Phase 1: Move to dead letter queue
      try {
        // Get item snapshot for debugging
        const { data: itemData } = await supabase
          .from('intake_items')
          .select('*')
          .eq('id', queueItem.inventory_item_id)
          .maybeSingle()
        
        await supabase
          .from('shopify_dead_letter_queue')
          .insert({
            original_queue_id: queueItem.id,
            inventory_item_id: queueItem.inventory_item_id,
            action: queueItem.action,
            error_message: error.message,
            error_type: errorType,
            retry_count: queueItem.retry_count + 1,
            item_snapshot: itemData || null,
            failure_context: {
              max_retries: queueItem.max_retries,
              final_error: error.message,
              failed_at: new Date().toISOString()
            }
          })
        
        console.log(`📬 Moved to dead letter queue: ${queueItem.id}`)
      } catch (dlqError) {
        console.error(`Failed to add to dead letter queue:`, dlqError)
      }
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.log('🔄 Shopify sync processor started')

  // JWT validation for mutating endpoint
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('❌ Missing or invalid Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let authenticatedUserId: string;
  
  try {
    // Verify JWT token
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(
      'https://dmpoandoydaqxhzdjnmk.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Invalid JWT token:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    authenticatedUserId = user.id;
    console.log('✅ Authenticated user:', user.id);
    
    // Verify user has required role (staff or admin)
    const serviceClient = createClient(
      'https://dmpoandoydaqxhzdjnmk.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: roles, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (roleError) {
      console.error('❌ Failed to fetch user roles:', roleError);
      return new Response(JSON.stringify({ error: 'Failed to verify permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const userRoles = roles?.map(r => r.role) || [];
    const hasRequiredRole = userRoles.some(role => ['admin', 'staff'].includes(role));
    
    if (!hasRequiredRole) {
      console.error('❌ Insufficient permissions for user:', user.id, 'roles:', userRoles);
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Required: admin or staff role.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ User has required role:', userRoles);
  } catch (authErr) {
    console.error('❌ Authentication error:', authErr);
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabase = createClient(
      'https://dmpoandoydaqxhzdjnmk.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if this is a single item processing request
    let requestBody = null
    if (req.method === 'POST') {
      try {
        requestBody = await req.json()
      } catch {
        // No body or invalid JSON - proceed with batch processing
      }
    }

    if (requestBody?.single_item_id) {
      console.log(`🎯 Processing single queue item: ${requestBody.single_item_id}`)
      
      // First mark the item as processing to avoid race conditions
      const { error: updateError } = await supabase
        .from('shopify_sync_queue')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString() 
        })
        .eq('id', requestBody.single_item_id)
        .eq('status', 'queued')
      
      if (updateError) {
        console.log(`⚠️ Could not update queue item status: ${updateError.message}`)
        return new Response(
          JSON.stringify({ success: true, message: 'Item already being processed or completed', processed: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Get the queue item details
      const { data: queueItems, error: queueError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .eq('id', requestBody.single_item_id)
        .eq('status', 'processing')
      
      if (queueError || !queueItems || queueItems.length === 0) {
        console.log('⚠️ Queue item not found or status changed')
        return new Response(
          JSON.stringify({ success: true, message: 'Item not found or already processed', processed: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Process the single item
      await processQueueItem(supabase, queueItems[0])
      
      console.log(`✅ Successfully processed single queue item: ${requestBody.single_item_id}`)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Processed single item: ${requestBody.single_item_id}`,
          processed: 1 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🚀 Starting Shopify sync processor (batch mode)...')
    
    // Clear any old problematic queue items first
    await supabase
      .from('shopify_sync_queue')
      .delete()
      .like('error_message', '%GraphQL%')
    
    // Get all pending queue items to process sequentially
    const { data: queueItems, error: queueError } = await supabase
      .from('shopify_sync_queue')
      .select('*')
      .eq('status', 'queued')
      .or('retry_after.is.null,retry_after.lte.now()')
      .order('retry_count', { ascending: true }) // Process items with fewer retries first
      .order('created_at', { ascending: true })
      .limit(50) // Process up to 50 items per run
    
    if (queueError) {
      throw new Error(`Failed to fetch queue items: ${queueError.message}`)
    }
    
    if (!queueItems || queueItems.length === 0) {
      console.log('✅ No items in queue to process')
      return new Response(
        JSON.stringify({ success: true, message: 'No items to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`📦 Processing ${queueItems.length} queue items sequentially...`)
    
    // Process items one by one to respect rate limits
    let processed = 0
    let failed = 0
    for (let i = 0; i < queueItems.length; i++) {
      const queueItem = queueItems[i]
      console.log(`📦 Processing item ${i + 1}/${queueItems.length}: ${queueItem.inventory_item_id}`)
      
      try {
        await processQueueItem(supabase, queueItem)
        processed++
        console.log(`✅ Processed ${processed}/${queueItems.length} items successfully`)
      } catch (error) {
        failed++
        console.error(`❌ Failed to process item ${queueItem.id} (${failed} failures):`, error)
        // Continue processing other items
      }
      
      // Delay between items to respect rate limits (1 second between items)
      if (i < queueItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log(`✅ Processed ${processed}/${queueItems.length} items successfully${failed > 0 ? `, ${failed} failed` : ''}`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed}/${queueItems.length} items${failed > 0 ? ` (${failed} failed)` : ''}`,
        processed,
        failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 Shopify sync processor error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})