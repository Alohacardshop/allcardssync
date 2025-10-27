import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  year?: string
  cost?: number
  shopify_product_id?: string
  shopify_variant_id?: string
}

interface ShopifyCredentials {
  domain: string
  access_token: string
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

async function findExistingProduct(credentials: ShopifyCredentials, sku: string, title?: string) {
  console.log(`🔍 Searching for existing product with SKU: ${sku}`)
  
  // First try to find by SKU
  try {
    const products = await shopifyRequest(credentials, `products.json?limit=1&fields=id,title,variants&handle=${sku}`)
    if (products.products && products.products.length > 0) {
      const product = products.products[0]
      const variant = product.variants.find((v: any) => v.sku === sku)
      if (variant) {
        console.log(`✅ Found existing product by SKU: ${product.id}, variant: ${variant.id}`)
        return { product, variant }
      }
    }
  } catch (error) {
    console.log(`⚠️ SKU search failed: ${error}`)
  }

  // For graded cards, try to find by barcode (PSA cert)
  if (title && title.includes('PSA')) {
    const psaCert = title.match(/PSA\s+(\d+)/)?.[1]
    if (psaCert) {
      try {
        const products = await shopifyRequest(credentials, `products.json?limit=1&fields=id,title,variants`)
        for (const product of products.products || []) {
          const variant = product.variants.find((v: any) => v.barcode === psaCert)
          if (variant) {
            console.log(`✅ Found existing graded product by PSA cert: ${product.id}, variant: ${variant.id}`)
            return { product, variant }
          }
        }
      } catch (error) {
        console.log(`⚠️ PSA cert search failed: ${error}`)
      }
    }
  }

  // For raw cards, try to find by title to add variant
  if (title) {
    try {
      const searchTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim()
      const products = await shopifyRequest(credentials, `products.json?limit=5&title=${encodeURIComponent(searchTitle)}`)
      
      for (const product of products.products || []) {
        if (product.title.toLowerCase().includes(searchTitle.toLowerCase())) {
          console.log(`✅ Found similar product for new variant: ${product.id}`)
          return { product, variant: null }
        }
      }
    } catch (error) {
      console.log(`⚠️ Title search failed: ${error}`)
    }
  }

  console.log(`❌ No existing product found`)
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
    
    // Debug logging
    console.log('DEBUG: Graded card title data:', {
      year: year,
      brand_title: item.brand_title,
      subject: item.subject,
      cardNumber: cardNumber,
      variant: variant,
      grade: item.grade,
      itemYear: item.year,
      catalogSnapshot: (item as any).catalog_snapshot
    })
    
    const parts = []
    if (year) parts.push(year)
    if (item.brand_title) parts.push(item.brand_title)
    if (item.subject) parts.push(item.subject)
    if (cardNumber) parts.push(cardNumber)
    if (variant) parts.push(variant)
    if (item.grade) parts.push(`PSA ${item.grade}`)
    
    title = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    console.log('DEBUG: Final graded card title:', title)
    
    // Get PSA cert number for description
    const psaCertNumber = (item as any).psa_cert || (item as any).catalog_snapshot?.certNumber || (item as any).catalog_snapshot?.psa_cert || item.sku
    description = `${title}\nPSA Cert: ${psaCertNumber}`
    
    // Tags for graded cards: brand, "graded", grade number, variant, category, lot number
    if (item.brand_title) tags.push(item.brand_title.toLowerCase())
    tags.push('graded')
    if (item.grade) tags.push(`psa-${item.grade}`)
    if (variant) tags.push(variant.toLowerCase())
    if (item.category) tags.push(item.category.toLowerCase().replace(/\s+/g, '-'))
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
    
    // Tags for raw cards: brand, condition, variant, category, lot number
    if (item.brand_title) tags.push(item.brand_title.toLowerCase())
    if (variant) tags.push(variant.toLowerCase())
    if (item.category) tags.push(item.category.toLowerCase().replace(/\s+/g, '-'))
    if ((item as any).lot_number) tags.push(`lot-${(item as any).lot_number}`)
    tags.push('raw')
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
    console.log('DEBUG: No images found, using default placeholder image')
  }
  
  const images = [...uniqueImageUrls].reverse().map((url, index) => ({
    src: url,
    alt: `${title} - Image ${index + 1}`
  }))
  
  console.log('DEBUG: Final images for product:', uniqueImageUrls)
  
  const handle = item.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  const productData = {
    product: {
      title,
      body_html: description,
      handle,
      product_type: item.category,
      vendor: (item as any).vendor || 'aloha card shop hawaii', // Use vendor from item or fallback
      status: 'active',
      tags: tags.join(', '),
      images: images, // Add images array
      variants: [{
        sku: item.sku,
        price: item.price.toString(),
        cost: item.cost ? item.cost.toString() : undefined,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        inventory_quantity: item.quantity,
        barcode: item.type === 'Graded' ? item.psa_cert : undefined,
        weight: 3, // 3oz as requested
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
      barcode: item.type === 'Graded' ? item.psa_cert : undefined,
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

async function setInventoryLevel(credentials: ShopifyCredentials, inventoryItemId: string, locationId: string, quantity: number) {
  console.log(`📊 Setting inventory: ${quantity} units at location ${locationId}`)
  
  await shopifyRequest(credentials, 'inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity
    })
  })
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
        // Find or create product/variant
        const existing = await findExistingProduct(credentials, item.sku, `${item.brand_title} ${item.subject} ${item.card_number}`.trim())
        
        if (existing.variant) {
          // Use existing variant
          product = existing.product
          variant = existing.variant
        } else if (existing.product && item.type === 'Raw') {
          // Add variant to existing product
          variant = await createProductVariant(credentials, existing.product.id, item)
          product = existing.product
        } else {
          // Create new product
          const created = await createShopifyProduct(credentials, item)
          product = created.product
          variant = created.variant
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
    
    console.log('✅ Authenticated user:', user.id);
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
    
    // Get pending queue items (max 2 at a time for better stability)  
    const { data: queueItems, error: queueError } = await supabase
      .from('shopify_sync_queue')
      .select('*')
      .eq('status', 'queued')
      .or('retry_after.is.null,retry_after.lte.now()')
      .order('retry_count', { ascending: true }) // Process items with fewer retries first
      .order('created_at', { ascending: true })
      .limit(2)
    
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
    
    console.log(`📦 Processing ${queueItems.length} queue items with REST API only...`)
    
    // Process items sequentially to respect rate limits
    let processed = 0
    for (const queueItem of queueItems) {
      try {
        await processQueueItem(supabase, queueItem)
        processed++
      } catch (error) {
        console.error(`Failed to process item ${queueItem.id}:`, error)
        // Continue processing other items
      }
      
      // Delay between items to respect rate limits
      if (processed < queueItems.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
    
    console.log(`✅ Processed ${processed}/${queueItems.length} items successfully`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed}/${queueItems.length} items`,
        processed 
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