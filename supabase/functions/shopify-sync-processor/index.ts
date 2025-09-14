import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
  
  if (response.status === 429) {
    throw new Error('RATE_LIMIT: Shopify rate limit exceeded')
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

    let processedCount = 0
    let maxProcessCount = 50 // Prevent infinite loops

    while (processedCount < maxProcessCount) {
      // Get next queued item
      const { data: queueItems, error: queueError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)

      if (queueError) {
        console.error('❌ Error fetching queue items:', queueError)
        break
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('✅ No more items in queue')
        break
      }

      const queueItem: QueueItem = queueItems[0]
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
          } catch (shopifyError: any) {
            // Check for rate limit errors and handle them specially
            if (shopifyError.message.includes('RATE_LIMIT')) {
              console.log(`⏳ Rate limit hit, will retry item ${queueItem.id} later`)
              
              // Update retry count but keep status as queued with longer delay
              await supabase
                .from('shopify_sync_queue')
                .update({
                  status: 'queued',
                  retry_count: queueItem.retry_count + 1,
                  error_message: 'Rate limited, will retry',
                  started_at: null
                })
                .eq('id', queueItem.id)
              
              // Wait longer for rate limits (30 seconds)
              console.log('⏳ Waiting 30 seconds due to rate limit...')
              await new Promise(resolve => setTimeout(resolve, 30000))
              continue // Skip the normal retry logic
            }
            
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

      } catch (error: any) {
        console.error(`❌ Error syncing item ${queueItem.id}:`, error)

        const newRetryCount = queueItem.retry_count + 1
        const shouldRetry = newRetryCount <= queueItem.max_retries
        
        // Enhanced error message with more context
        const errorMessage = error instanceof Error ? error.message : String(error)
        const fullErrorMessage = `Attempt ${newRetryCount}/${queueItem.max_retries}: ${errorMessage}`

        await supabase
          .from('shopify_sync_queue')
          .update({
            status: shouldRetry ? 'queued' : 'failed',
            retry_count: newRetryCount,
            error_message: fullErrorMessage,
            completed_at: shouldRetry ? null : new Date().toISOString(),
            started_at: null // Reset started_at for retry
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
          console.log(`🔄 Item ${queueItem.id} will retry (attempt ${newRetryCount}/${queueItem.max_retries})`)
        }
      }

      processedCount++

      // Wait 2 seconds before next item
      if (processedCount < maxProcessCount) {
        console.log('⏳ Waiting 2 seconds before next item...')
        await new Promise(resolve => setTimeout(resolve, 2000))
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