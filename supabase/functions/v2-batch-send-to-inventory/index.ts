// Batch sender: moves items from intake to inventory and routes to appropriate Shopify sender
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { sleep } from '../_shared/shopify-helpers.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  })
  
  try {
    const { itemIds, storeKey, locationGid } = await req.json().catch(() => ({}))
    if (!itemIds?.length || !storeKey || !locationGid) {
      return json(400, { error: 'Expected { itemIds: string[], storeKey, locationGid }' })
    }

  console.log(`🚀 [v2-batch-send-to-inventory] Processing ${itemIds.length} items for ${storeKey}`)
    console.log(`📦 Item IDs:`, itemIds)
    
    // First, move items to inventory using existing RPC
    const { data: moveResult, error: moveError } = await supabase.rpc('send_intake_items_to_inventory', { item_ids: itemIds })
    if (moveError) {
      console.error(`❌ Move to inventory failed:`, moveError)
      throw new Error(`Move to inventory failed: ${moveError.message}`)
    }
    
    const processedIds = moveResult?.processed_ids || []
    const rejected = moveResult?.rejected || []
    console.log(`✅ Moved ${processedIds.length} items to inventory, ${rejected.length} rejected`)
    console.log(`📋 Processed IDs:`, processedIds)
    console.log(`❌ Rejected:`, rejected)

    // Fetch the processed items to determine routing
    const { data: items, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, type, sku, psa_cert, grade, price, cost, quantity, category, variant, lot_number, brand_title, subject, year, card_number, psa_snapshot, catalog_snapshot')
      .in('id', processedIds)
    
    if (fetchError) throw new Error(`Fetch items failed: ${fetchError.message}`)

    const results = []
    
    // Process each item through appropriate Shopify sender
    for (const item of items || []) {
      try {
        // Determine type: use DB type field, fallback to inference
        let itemType = item.type
        if (!itemType) {
          itemType = (item.psa_cert || item.grade) ? 'Graded' : 'Raw'
        }

        // Derive game from available data
        const derivedGame = item.catalog_snapshot?.game || 
                          (item.brand_title?.toLowerCase().includes('pokemon') ? 'pokemon' : 'pokemon')

        const shopifyPayload = {
          storeKey,
          locationGid,
          item: {
            id: item.id,
            sku: item.sku,
            price: item.price,
            cost: item.cost,
            quantity: item.quantity,
            category: item.category,
            variant: item.variant,
            lot_number: item.lot_number,
            brand_title: item.brand_title,
            subject: item.subject,
            year: item.year,
            card_number: item.card_number,
            category_tag: derivedGame || 'Pokemon',
            image_url: item.psa_snapshot?.image_url || item.catalog_snapshot?.image_url,
            ...(itemType === 'Graded' ? {
              psa_cert: item.psa_cert,
              grade: item.grade
            } : {
              condition: item.variant // Raw items use variant as condition
            })
          }
        }

        // Route to appropriate sender
        const functionName = itemType === 'Graded' ? 'v2-shopify-send-graded' : 'v2-shopify-send-raw'
        console.log(`🎯 Sending ${item.id} (${itemType}) to ${functionName}`)
        
        const { data: shopifyResult, error: shopifyError } = await supabase.functions.invoke(functionName, {
          body: shopifyPayload
        })

        if (shopifyError) {
          console.error(`❌ Shopify send failed for ${item.id}:`, shopifyError)
          throw shopifyError
        }
        
        console.log(`✅ Shopify send success for ${item.id}:`, shopifyResult)

        results.push({
          id: item.id,
          type: itemType,
          success: true,
          shopify: shopifyResult,
          correlationId: shopifyResult?.correlationId,
          productId: shopifyResult?.productId,
          variantId: shopifyResult?.variantId,
          inventoryItemId: shopifyResult?.inventoryItemId
        })

        console.info('batch.send.item', { 
          id: item.id, 
          sku: item.sku, 
          type: itemType, 
          correlationId: shopifyResult?.correlationId 
        })

        // Note: Don't update sync status here - the sender functions already write their own status and snapshots

      } catch (error: any) {
        console.error(`❌ Failed to sync item ${item.id}:`, error)
        console.error(`📝 Error details:`, error.stack || error)
        results.push({
          id: item.id,
          type: itemType || 'unknown',
          success: false,
          error: error.message
        })

        // Note: Don't update sync status here - the sender functions already write their own status and snapshots
      }

      // Rate limiting - small delay between items
      await sleep(50)
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length

    console.log(`🎉 Batch processing complete:`)
    console.log(`📊 Stats: ${successCount} success, ${errorCount} errors`)
    console.log(`📦 Processed: ${processedIds.length}, Rejected: ${rejected.length}`)

    return json(200, {
      ok: true,
      processed: processedIds.length,
      rejected: rejected.length,
      shopify_success: successCount,
      shopify_errors: errorCount,
      results,
      rejected_items: rejected
    })

  } catch (e: any) {
    console.error('v2-batch-send-to-inventory', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Internal error' })
  }
})