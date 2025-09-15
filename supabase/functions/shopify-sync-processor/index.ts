import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Shopify API helpers
async function getShopifyCredentials(supabase: any, storeKey: string) {
  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('domain')
    .eq('key', storeKey)
    .single()
  
  if (error) throw new Error(`Store not found: ${error.message}`)
  
  // Get access token from system settings
  const { data: tokenData, error: tokenError } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`)
    .single()
    
  if (tokenError) throw new Error(`Access token not found: ${tokenError.message}`)
  
  return {
    domain: store.domain,
    accessToken: tokenData.key_value
  }
}

async function shopifyGraphQL(domain: string, token: string, query: string, variables?: any) {
  const response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables })
  })
  
  const data = await response.json()
  
  // Enhanced rate limit monitoring
  const callLimit = response.headers.get('X-Shopify-Shop-Api-Call-Limit')
  const rateLimitInfo = callLimit ? callLimit.split('/') : null
  
  if (rateLimitInfo) {
    const [current, max] = rateLimitInfo.map(Number)
    const usage = (current / max) * 100
    
    console.log(`📊 API Usage: ${current}/${max} (${usage.toFixed(1)}%)`)
    
    // Return rate limit info for dynamic adjustment
    if (usage > 80) {
      console.log(`⚠️ High API usage: ${usage.toFixed(1)}%`)
      return { ...data.data, _rateLimitWarning: true, _usage: usage }
    }
  }
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new Error(`RATE_LIMIT: ${retryAfter ? `Retry after ${retryAfter}s` : 'Shopify rate limit exceeded'}`)
  }
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} - ${JSON.stringify(data)}`)
  }
  
  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`)
  }
  
  return data.data
}

async function createShopifyProduct(credentials: any, item: InventoryItem, locationId: string) {
  const { domain, accessToken } = credentials
  
  // Generate title based on item type
  let title = item.title
  if (!title) {
    if (item.type === 'Graded') {
      title = `${item.brand_title || ''} ${item.subject || ''} #${item.card_number || ''} ${item.grade || ''} ${item.psa_cert || ''}`.trim()
    } else {
      title = `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim()
    }
  }
  
  // Ensure we have a title
  if (!title || title.length < 3) {
    title = item.sku || `Product ${item.id.slice(0, 8)}`
  }
  
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
          title
          variants(first: 1) {
            edges {
              node {
                id
                inventoryItem {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `
  
  const variables = {
    input: {
      title: title,
      bodyHtml: item.type === 'Graded' 
        ? `<p>Graded Card - ${item.grade || 'Grade Unknown'}</p><p>Certificate: ${item.psa_cert || 'N/A'}</p>`
        : `<p>Trading Card</p><p>Condition: ${item.condition || 'Good'}</p>`,
      vendor: item.brand_title || 'Trading Cards',
      productType: item.category_tag || 'Trading Card',
      tags: [item.type, item.brand_title, item.category_tag].filter(Boolean),
      variants: [{
        price: item.price?.toString() || '0.00',
        sku: item.sku,
        inventoryManagement: 'SHOPIFY',
        inventoryPolicy: 'DENY'
      }],
      status: 'ACTIVE'
    }
  }
  
  console.log(`📦 Creating Shopify product: ${title} (${item.sku})`)
  
  const result = await shopifyGraphQL(domain, accessToken, mutation, variables)
  
  if (result.productCreate.userErrors?.length > 0) {
    throw new Error(`Product creation failed: ${JSON.stringify(result.productCreate.userErrors)}`)
  }
  
  const product = result.productCreate.product
  const variantId = product.variants.edges[0]?.node?.id
  const inventoryItemId = product.variants.edges[0]?.node?.inventoryItem?.id
  
  // Set inventory quantity if we have the location and inventory item
  if (inventoryItemId && item.quantity && item.quantity > 0) {
    await setInventoryLevel(domain, accessToken, inventoryItemId, locationId, item.quantity)
  }
  
  return {
    productId: product.id,
    variantId: variantId,
    inventoryItemId: inventoryItemId,
    handle: product.handle
  }
}

async function setInventoryLevel(domain: string, token: string, inventoryItemId: string, locationId: string, quantity: number) {
  const mutation = `
    mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        inventoryAdjustmentGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `
  
  // Parse numeric ID from GID
  const numericLocationId = locationId.split('/').pop()
  
  const variables = {
    input: {
      setQuantities: [{
        inventoryItemId: inventoryItemId,
        locationId: `gid://shopify/Location/${numericLocationId}`,
        quantity: quantity
      }]
    }
  }
  
  console.log(`📊 Setting inventory: ${quantity} units at location ${numericLocationId}`)
  
  const result = await shopifyGraphQL(domain, token, mutation, variables)
  
  if (result.inventorySetOnHandQuantities.userErrors?.length > 0) {
    console.warn(`⚠️ Inventory update warnings: ${JSON.stringify(result.inventorySetOnHandQuantities.userErrors)}`)
  }
  
  return result
}

interface QueueItem {
  id: string
  inventory_item_id: string
  action: 'create' | 'update' | 'delete'
  retry_count: number
  max_retries: number
  shopify_product_id?: string
}

interface InventoryItem {
  id: string
  store_key: string
  shopify_location_gid: string
  sku: string
  type: string
  title?: string
  price?: number
  quantity?: number
  brand_title?: string
  subject?: string
  card_number?: string
  variant?: string
  category_tag?: string
  image_url?: string
  cost?: number
  grade?: string
  psa_cert?: string
  year?: string
  condition?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('🔄 Starting Shopify sync processor...')

    // Get processing settings from system_settings
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', ['SHOPIFY_BATCH_SIZE', 'SHOPIFY_BATCH_DELAY', 'SHOPIFY_MAX_PROCESS_COUNT'])

    const settings = settingsData?.reduce((acc: any, setting) => {
      acc[setting.key_name] = setting.key_value
      return acc
    }, {}) || {}

    const batchSize = parseInt(settings.SHOPIFY_BATCH_SIZE || '1')
    const batchDelay = parseInt(settings.SHOPIFY_BATCH_DELAY || '2000') // milliseconds
    const maxProcessCount = parseInt(settings.SHOPIFY_MAX_PROCESS_COUNT || '50')

    console.log(`⚙️ Processing config: ${batchSize} items per batch, ${batchDelay}ms delay, max ${maxProcessCount} items`)

    let processedCount = 0
    let consecutiveRateLimits = 0
    let dynamicDelay = batchDelay

    while (processedCount < maxProcessCount) {
      // Get next batch of queued items
      const { data: queueItems, error: queueError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(batchSize)

      if (queueError) {
        console.error('❌ Error fetching queue items:', queueError)
        break
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('✅ No more items in queue')
        break
      }

      console.log(`📦 Processing batch of ${queueItems.length} items`)

      // Process each item in the current batch
      for (const queueItem of queueItems) {
        console.log(`📦 Processing item ${queueItem.id} (${queueItem.action})`)

      // Mark as processing
      const { error: updateError } = await supabase
        .from('shopify_sync_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', queueItem.id)

      if (updateError) {
        console.error('❌ Error updating queue status:', updateError)
        continue
      }

      try {
        // Get inventory item details
        const { data: inventoryItem, error: itemError } = await supabase
          .from('intake_items')
          .select('*')
          .eq('id', queueItem.inventory_item_id)
          .single()

        if (itemError || !inventoryItem) {
          throw new Error(`Inventory item not found: ${itemError?.message}`)
        }

        const item: InventoryItem = inventoryItem
        
        // Validate required fields
        if (!item.store_key) {
          throw new Error('Missing store_key')
        }
        if (!item.shopify_location_gid) {
          throw new Error('Missing shopify_location_gid')
        }
        if (!item.sku) {
          throw new Error('Missing SKU')
        }

        // Get Shopify credentials
        const credentials = await getShopifyCredentials(supabase, item.store_key)
        console.log(`🔐 Retrieved credentials for store: ${item.store_key}`)
        
        let shopifyResult: any = {}

        if (queueItem.action === 'delete') {
          // Handle deletion - for now just log it
          console.log(`🗑️ Delete action for item ${queueItem.id} - skipping for now`)
          shopifyResult = { deleted: true }
        } else {
          // Handle create/update - create new product in Shopify
          try {
            shopifyResult = await createShopifyProduct(
              credentials,
              item,
              item.shopify_location_gid
            )
            console.log(`✅ Created Shopify product: ${shopifyResult.productId}`)
            
            // Check for rate limit warnings and adjust delay
            if (shopifyResult._rateLimitWarning) {
              dynamicDelay = Math.min(dynamicDelay * 1.5, 10000) // Cap at 10 seconds
              console.log(`⚠️ Increased delay to ${dynamicDelay}ms due to high API usage`)
            } else if (consecutiveRateLimits === 0) {
              // Gradually reduce delay if no rate limit issues
              dynamicDelay = Math.max(dynamicDelay * 0.9, batchDelay)
            }
            
          } catch (shopifyError: any) {
            // Enhanced rate limit handling
            if (shopifyError.message.includes('RATE_LIMIT')) {
              consecutiveRateLimits++
              console.log(`⏳ Rate limit hit (#${consecutiveRateLimits}), will retry item ${queueItem.id} later`)
              
              // Exponential backoff for rate limits
              const backoffTime = Math.min(600000, 30000 * Math.pow(2, consecutiveRateLimits - 1)) // Cap at 10 minutes
              
              // Update retry count but keep status as queued
              await supabase
                .from('shopify_sync_queue')
                .update({
                  status: 'queued',
                  retry_count: queueItem.retry_count + 1,
                  error_message: `Rate limited, backoff ${backoffTime/1000}s`,
                  started_at: null
                })
                .eq('id', queueItem.id)
              
              console.log(`⏳ Waiting ${backoffTime/1000} seconds due to rate limit...`)
              await new Promise(resolve => setTimeout(resolve, backoffTime))
              continue // Skip the normal retry logic
            }
            
            // Reset consecutive rate limits on other errors
            consecutiveRateLimits = 0
            throw shopifyError
          }
        }

        // Mark as completed
        await supabase
          .from('shopify_sync_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            shopify_product_id: shopifyResult.productId || queueItem.shopify_product_id
          })
          .eq('id', queueItem.id)

        // Update the original inventory item with Shopify IDs
        if (shopifyResult.productId) {
          await supabase
            .from('intake_items')
            .update({
              shopify_product_id: shopifyResult.productId,
              shopify_variant_id: shopifyResult.variantId,
              shopify_inventory_item_id: shopifyResult.inventoryItemId,
              shopify_sync_status: 'completed',
              last_shopify_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id)
        }

        console.log(`✅ Successfully synced item ${queueItem.id} -> Product ${shopifyResult.productId}`)
        
        // Reset consecutive rate limits on success
        consecutiveRateLimits = 0

      } catch (error: any) {
        console.error(`❌ Error syncing item ${queueItem.id}:`, error)

        const newRetryCount = queueItem.retry_count + 1
        const shouldRetry = newRetryCount <= queueItem.max_retries
        
        // Enhanced error message with more context
        const errorMessage = error instanceof Error ? error.message : String(error)
        const fullErrorMessage = `Attempt ${newRetryCount}/${queueItem.max_retries}: ${errorMessage}`

        // Determine retry delay with exponential backoff
        let retryDelay = 0
        if (shouldRetry) {
          // Base delay of 30 seconds, exponentially increasing
          retryDelay = Math.min(30 * Math.pow(2, newRetryCount - 1), 300) // Cap at 5 minutes
          console.log(`⏳ Will retry item ${queueItem.id} in ${retryDelay} seconds`)
        }

        await supabase
          .from('shopify_sync_queue')
          .update({
            status: shouldRetry ? 'queued' : 'failed',
            retry_count: newRetryCount,
            error_message: fullErrorMessage,
            completed_at: shouldRetry ? null : new Date().toISOString(),
            started_at: null, // Reset started_at for retry
            retry_after: shouldRetry ? new Date(Date.now() + retryDelay * 1000).toISOString() : null
          })
          .eq('id', queueItem.id)

        // Update inventory item sync status if failed permanently
        if (!shouldRetry) {
          await supabase
            .from('intake_items')
            .update({
              shopify_sync_status: 'failed',
              last_shopify_sync_error: fullErrorMessage,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.inventory_item_id)
            
          console.log(`💀 Item ${queueItem.id} failed permanently after ${queueItem.max_retries} retries`)
        } else {
          console.log(`🔄 Item ${queueItem.id} will retry (attempt ${newRetryCount}/${queueItem.max_retries}) after ${retryDelay}s`)
          
          // If this is a retry, wait the calculated delay before continuing
          if (retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * 1000))
          }
        }
      }

      } // End of batch processing loop
      
      processedCount += queueItems.length

      // Dynamic delay between batches
      if (processedCount < maxProcessCount && queueItems.length > 0) {
        console.log(`⏳ Waiting ${dynamicDelay}ms before next batch...`)
        await new Promise(resolve => setTimeout(resolve, dynamicDelay))
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        message: `Processed ${processedCount} items`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Processor error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
