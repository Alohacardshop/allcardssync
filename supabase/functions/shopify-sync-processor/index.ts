import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

        // Determine sync function based on item type and action
        let syncResult
        if (queueItem.action === 'delete') {
          // Handle deletion
          if (item.type === 'Graded') {
            syncResult = await supabase.functions.invoke('v2-shopify-remove-graded', {
              body: {
                storeKey: item.store_key,
                sku: item.sku
              }
            })
          } else {
            syncResult = await supabase.functions.invoke('v2-shopify-remove-raw', {
              body: {
                storeKey: item.store_key,
                sku: item.sku
              }
            })
          }
        } else {
          // Handle create/update
          if (item.type === 'Graded') {
            syncResult = await supabase.functions.invoke('v2-shopify-send-graded', {
              body: {
                storeKey: item.store_key,
                locationGid: item.shopify_location_gid,
                item: {
                  id: item.id,
                  sku: item.sku,
                  psa_cert: item.psa_cert,
                  title: item.title,
                  price: item.price,
                  grade: item.grade,
                  quantity: item.quantity,
                  year: item.year,
                  brand_title: item.brand_title,
                  subject: item.subject,
                  card_number: item.card_number,
                  variant: item.variant,
                  category_tag: item.category_tag,
                  image_url: item.image_url,
                  cost: item.cost
                }
              }
            })
          } else {
            syncResult = await supabase.functions.invoke('v2-shopify-send-raw', {
              body: {
                storeKey: item.store_key,
                locationGid: item.shopify_location_gid,
                item: {
                  id: item.id,
                  sku: item.sku,
                  brand_title: item.brand_title,
                  subject: item.subject,
                  card_number: item.card_number,
                  image_url: item.image_url,
                  cost: item.cost,
                  title: item.title,
                  price: item.price,
                  condition: item.condition,
                  quantity: item.quantity
                }
              }
            })
          }
        }

        if (syncResult.error) {
          throw new Error(syncResult.error.message)
        }

        // Mark as completed
        await supabase
          .from('shopify_sync_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            shopify_product_id: syncResult.data?.shopify_product_id || null
          })
          .eq('id', queueItem.id)

        console.log(`✅ Successfully synced item ${queueItem.id}`)

      } catch (error) {
        console.error(`❌ Error syncing item ${queueItem.id}:`, error)

        const newRetryCount = queueItem.retry_count + 1
        const shouldRetry = newRetryCount <= queueItem.max_retries

        await supabase
          .from('shopify_sync_queue')
          .update({
            status: shouldRetry ? 'queued' : 'failed',
            retry_count: newRetryCount,
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: shouldRetry ? null : new Date().toISOString()
          })
          .eq('id', queueItem.id)

        if (!shouldRetry) {
          console.log(`💀 Item ${queueItem.id} failed after ${queueItem.max_retries} retries`)
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