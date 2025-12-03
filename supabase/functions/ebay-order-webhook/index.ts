import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EbayOrderNotification {
  metadata?: {
    topic: string;
    schemaVersion: string;
    deprecated: boolean;
  };
  notification?: {
    notificationId: string;
    eventDate: string;
    publishDate: string;
    publishAttemptCount: number;
    data: {
      orderId: string;
      orderLineItems?: Array<{
        lineItemId: string;
        legacyItemId: string;
        legacyVariationId?: string;
        sku?: string;
        title: string;
        quantity: number;
        lineItemCost: {
          value: string;
          currency: string;
        };
        lineItemFulfillmentStatus: string;
      }>;
      buyer?: {
        username: string;
      };
      pricingSummary?: {
        total: {
          value: string;
          currency: string;
        };
      };
      orderFulfillmentStatus?: string;
      orderPaymentStatus?: string;
      creationDate?: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle eBay challenge for endpoint verification
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const challengeCode = url.searchParams.get('challenge_code')
    
    if (challengeCode) {
      const verificationToken = Deno.env.get('EBAY_VERIFICATION_TOKEN') || ''
      const endpoint = Deno.env.get('EBAY_WEBHOOK_ENDPOINT') || req.url.split('?')[0]
      
      // eBay expects SHA-256 hash of challengeCode + verificationToken + endpoint
      const encoder = new TextEncoder()
      const data = encoder.encode(challengeCode + verificationToken + endpoint)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const challengeResponse = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      console.log('[eBay Webhook] Challenge verification request')
      
      return new Response(
        JSON.stringify({ challengeResponse }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload: EbayOrderNotification = await req.json()
    
    console.log('[eBay Webhook] Received notification:', JSON.stringify(payload.metadata || {}))

    const topic = payload.metadata?.topic
    const orderData = payload.notification?.data

    if (!orderData) {
      console.log('[eBay Webhook] No order data in notification')
      return new Response(
        JSON.stringify({ success: true, message: 'No order data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orderId = orderData.orderId
    const orderStatus = orderData.orderPaymentStatus
    const fulfillmentStatus = orderData.orderFulfillmentStatus

    console.log(`[eBay Webhook] Processing order ${orderId}, payment: ${orderStatus}, fulfillment: ${fulfillmentStatus}`)

    // Process based on topic
    if (topic === 'MARKETPLACE_ACCOUNT_DELETION') {
      // Handle account deletion notification
      console.log('[eBay Webhook] Account deletion notification - logging only')
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process order line items for sale tracking
    const lineItems = orderData.orderLineItems || []
    const processedItems: string[] = []
    const errors: string[] = []

    for (const lineItem of lineItems) {
      const sku = lineItem.sku
      const ebayItemId = lineItem.legacyItemId
      const quantity = lineItem.quantity

      if (!sku && !ebayItemId) {
        console.log(`[eBay Webhook] Line item missing SKU and item ID, skipping`)
        continue
      }

      try {
        // Find the inventory item by eBay listing ID or SKU
        let query = supabase
          .from('intake_items')
          .select('id, sku, quantity, shopify_product_id, shopify_variant_id, store_key, shopify_location_gid')

        if (sku) {
          query = query.eq('ebay_inventory_item_sku', sku)
        } else if (ebayItemId) {
          query = query.eq('ebay_listing_id', ebayItemId)
        }

        const { data: items, error: findError } = await query.limit(1)

        if (findError) {
          console.error(`[eBay Webhook] Error finding item:`, findError)
          errors.push(`Find error for ${sku || ebayItemId}: ${findError.message}`)
          continue
        }

        if (!items || items.length === 0) {
          console.log(`[eBay Webhook] No matching item found for SKU: ${sku}, eBay ID: ${ebayItemId}`)
          errors.push(`No item found for ${sku || ebayItemId}`)
          continue
        }

        const item = items[0]
        const newQuantity = Math.max(0, (item.quantity || 1) - quantity)

        // Update the item - mark as sold if quantity reaches 0
        const updateData: Record<string, any> = {
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
          updated_by: 'ebay_webhook'
        }

        // If fully sold, update sold fields
        if (newQuantity === 0) {
          updateData.sold_at = new Date().toISOString()
          updateData.sold_channel = 'ebay'
          updateData.sold_order_id = orderId
          updateData.sold_price = parseFloat(lineItem.lineItemCost.value)
          updateData.sold_currency = lineItem.lineItemCost.currency
        }

        const { error: updateError } = await supabase
          .from('intake_items')
          .update(updateData)
          .eq('id', item.id)

        if (updateError) {
          console.error(`[eBay Webhook] Error updating item ${item.id}:`, updateError)
          errors.push(`Update error for ${item.sku}: ${updateError.message}`)
          continue
        }

        console.log(`[eBay Webhook] Updated item ${item.sku}: quantity ${item.quantity} -> ${newQuantity}`)
        processedItems.push(item.sku || item.id)

        // If item has Shopify sync, queue inventory update
        if (item.shopify_product_id && item.shopify_variant_id && newQuantity === 0) {
          console.log(`[eBay Webhook] Queueing Shopify inventory update for ${item.sku}`)
          
          // Add to Shopify sync queue to update inventory
          await supabase
            .from('shopify_sync_queue')
            .insert({
              inventory_item_id: item.id,
              action: 'update',
              status: 'queued',
              retry_count: 0,
              max_retries: 3,
              updated_by: 'ebay_webhook'
            })
        }

      } catch (itemError: any) {
        console.error(`[eBay Webhook] Error processing line item:`, itemError)
        errors.push(`Processing error: ${itemError.message}`)
      }
    }

    // Log the webhook event
    await supabase
      .from('system_logs')
      .insert({
        level: errors.length > 0 ? 'warning' : 'info',
        message: `eBay order webhook processed: ${orderId}`,
        source: 'ebay-order-webhook',
        context: {
          topic,
          orderId,
          orderStatus,
          fulfillmentStatus,
          processedItems,
          errors,
          lineItemCount: lineItems.length
        }
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId,
        processed: processedItems.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[eBay Webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
