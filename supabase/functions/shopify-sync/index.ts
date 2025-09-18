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
  shopify_product_id?: string
  shopify_variant_id?: string
}

interface ShopifyCredentials {
  domain: string
  access_token: string
}

// Rate limiting state
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 500 // 500ms between requests

async function rateLimitDelay() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delayNeeded = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    await new Promise(resolve => setTimeout(resolve, delayNeeded))
  }
  lastRequestTime = Date.now()
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

  // Get access token from system settings
  const { data: tokenSetting, error: tokenError } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_ACCESS_TOKEN_${storeKey.toUpperCase()}`)
    .single()
  
  if (tokenError || !tokenSetting) {
    throw new Error(`Access token not found for store: ${storeKey}`)
  }

  return {
    domain: store.domain,
    access_token: tokenSetting.key_value
  }
}

async function shopifyRequest(credentials: ShopifyCredentials, endpoint: string, options: RequestInit = {}) {
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

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Shopify API error: ${response.status} - ${errorText}`)
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`)
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
  const title = `${item.brand_title} ${item.subject} ${item.card_number}`.trim()
  const handle = item.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  const productData = {
    product: {
      title,
      handle,
      product_type: item.category,
      vendor: item.brand_title,
      status: 'active',
      variants: [{
        sku: item.sku,
        price: item.price.toString(),
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        inventory_quantity: item.quantity,
        barcode: item.type === 'Graded' ? item.psa_cert : undefined
      }]
    }
  }

  console.log(`📦 Creating new product: ${title}`)
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
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      inventory_quantity: item.quantity,
      barcode: item.type === 'Graded' ? item.psa_cert : undefined,
      option1: item.variant || 'Default'
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
    
    const shouldRetry = queueItem.retry_count < queueItem.max_retries
    const retryAfter = shouldRetry ? new Date(Date.now() + Math.pow(2, queueItem.retry_count) * 30000) : null
    
    // Update queue item with error details and better retry logic
    const errorMessage = `Attempt ${queueItem.retry_count + 1}/${queueItem.max_retries}: ${error.message}`
    
    await supabase
      .from('shopify_sync_queue')
      .update({
        status: shouldRetry ? 'queued' : 'failed',
        retry_count: queueItem.retry_count + 1,
        retry_after: retryAfter?.toISOString(),
        error_message: errorMessage
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
      console.log(`🔄 Will retry queue item ${queueItem.id} in ${Math.pow(2, queueItem.retry_count) * 30} seconds`)
    } else {
      console.log(`💀 Queue item ${queueItem.id} failed permanently after ${queueItem.retry_count} retries`)
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      'https://dmpoandoydaqxhzdjnmk.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🚀 Starting Shopify sync processor...')
    
    // Get pending queue items (max 10 at a time)
    const { data: queueItems, error: queueError } = await supabase
      .from('shopify_sync_queue')
      .select('*')
      .eq('status', 'queued')
      .or('retry_after.is.null,retry_after.lte.now()')
      .order('created_at', { ascending: true })
      .limit(10)
    
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
    
    console.log(`📦 Processing ${queueItems.length} queue items...`)
    
    // Process items sequentially to respect rate limits
    let processed = 0
    for (const queueItem of queueItems) {
      await processQueueItem(supabase, queueItem)
      processed++
      
      // Small delay between items
      if (processed < queueItems.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log(`✅ Processed ${processed} items successfully`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed} items`,
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