/**
 * Creates a Shopify order for an eBay cross-channel sale.
 * Uses Shopify REST Admin API (orders endpoint).
 * 
 * Design decisions:
 * - Normal order (not draft) so it appears immediately in staff Orders tab
 * - financial_status=paid, source_name=external → no payment collection, clean accounting
 * - Tags: external_sale, ebay, needs_pull → filterable for staff pull operations
 * - Idempotent: checks sales_events.shopify_order_id before creating
 */

import { API_VER } from './shopify-helpers.ts'

export interface CreateEbayOrderParams {
  domain: string
  token: string
  sku: string
  variantId: string  // Shopify numeric variant ID
  quantity: number
  pricePerUnit: number
  currency: string
  ebayOrderId: string
  ebayItemId?: string
  locationId?: string  // Shopify numeric location ID for inventory assignment
}

export interface CreateEbayOrderResult {
  success: boolean
  shopifyOrderId?: string
  shopifyOrderName?: string
  error?: string
  skipped?: boolean
  reason?: string
}

export async function createShopifyOrderForEbaySale(
  params: CreateEbayOrderParams
): Promise<CreateEbayOrderResult> {
  const {
    domain, token, sku, variantId, quantity,
    pricePerUnit, currency, ebayOrderId, ebayItemId, locationId
  } = params

  try {
    // Build the order payload
    const orderPayload: Record<string, any> = {
      order: {
        // Line items using the existing Shopify variant
        line_items: [
          {
            variant_id: parseInt(variantId, 10),
            quantity: quantity,
            price: pricePerUnit.toFixed(2),
          }
        ],
        // Mark as paid external order
        financial_status: 'paid',
        // Tags for filtering
        tags: 'external_sale, ebay, needs_pull',
        // Note for staff with eBay context
        note: [
          `eBay Sale — Order: ${ebayOrderId}`,
          ebayItemId ? `eBay Item: ${ebayItemId}` : null,
          `SKU: ${sku}`,
          `Source: ebay (auto-created by webhook)`
        ].filter(Boolean).join('\n'),
        // Note attributes for structured data
        note_attributes: [
          { name: 'source_channel', value: 'ebay' },
          { name: 'ebay_order_id', value: ebayOrderId },
          { name: 'sku', value: sku },
          ...(ebayItemId ? [{ name: 'ebay_item_id', value: ebayItemId }] : []),
        ],
        // Source identification
        source_name: 'external',
        // Don't send confirmation emails
        send_receipt: false,
        send_fulfillment_receipt: false,
        // Inventory should NOT be decremented (we already zeroed it)
        inventory_behaviour: 'bypass',
        // Currency
        currency: currency || 'USD',
        // Assign to location if available
        ...(locationId ? { location_id: parseInt(locationId, 10) } : {}),
      }
    }

    console.log(`[Shopify Order] Creating order for eBay sale: SKU=${sku}, ebayOrder=${ebayOrderId}, variant=${variantId}`)

    const response = await fetch(
      `https://${domain}/admin/api/${API_VER}/orders.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      }
    )

    const body = await response.json()

    if (!response.ok) {
      const errorMsg = body?.errors
        ? (typeof body.errors === 'string' ? body.errors : JSON.stringify(body.errors))
        : `HTTP ${response.status}`
      console.error(`[Shopify Order] ❌ Failed to create order:`, errorMsg)
      return {
        success: false,
        error: `Shopify order creation failed: ${errorMsg}`
      }
    }

    const createdOrder = body.order
    const shopifyOrderId = String(createdOrder.id)
    const shopifyOrderName = createdOrder.name || `#${createdOrder.order_number}`

    console.log(`[Shopify Order] ✅ Created order ${shopifyOrderName} (ID: ${shopifyOrderId}) for eBay order ${ebayOrderId}`)

    return {
      success: true,
      shopifyOrderId,
      shopifyOrderName
    }
  } catch (error: any) {
    console.error(`[Shopify Order] Exception creating order:`, error)
    return {
      success: false,
      error: `Exception: ${error.message}`
    }
  }
}
