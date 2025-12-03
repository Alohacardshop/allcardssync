import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getValidAccessToken,
  createOrUpdateInventoryItem,
  createOffer,
  publishOffer,
  mapConditionToEbay,
  type EbayInventoryItem,
  type EbayOffer,
} from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateListingRequest {
  intake_item_id: string
  store_key: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { intake_item_id, store_key }: CreateListingRequest = await req.json()

    if (!intake_item_id || !store_key) {
      return new Response(
        JSON.stringify({ error: 'intake_item_id and store_key are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[ebay-create-listing] Starting for item=${intake_item_id} store=${store_key}`)

    // Get store config
    const { data: storeConfig, error: configError } = await supabase
      .from('ebay_store_config')
      .select('*')
      .eq('store_key', store_key)
      .single()

    if (configError || !storeConfig) {
      throw new Error(`eBay store config not found for ${store_key}`)
    }

    const environment = storeConfig.environment as 'sandbox' | 'production'

    // Get the intake item
    const { data: item, error: itemError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', intake_item_id)
      .single()

    if (itemError || !item) {
      throw new Error(`Intake item not found: ${intake_item_id}`)
    }

    // Check if already has eBay listing
    if (item.ebay_listing_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Item already has eBay listing',
          listing_id: item.ebay_listing_id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, store_key, environment)

    // Build eBay SKU (use existing SKU or generate)
    const ebaySku = item.sku || `INV-${item.id.substring(0, 8)}`

    // Build title from item data
    const title = buildTitle(item, storeConfig.title_template)

    // Build description
    const description = buildDescription(item, storeConfig.description_template)

    // Create inventory item
    const inventoryItem: EbayInventoryItem = {
      sku: ebaySku,
      product: {
        title: title.substring(0, 80), // eBay title limit
        description: description,
        imageUrls: item.image_urls || [],
      },
      condition: mapConditionToEbay(item.grade ? 'excellent' : 'new'),
      availability: {
        shipToLocationAvailability: {
          quantity: item.quantity || 1,
        },
      },
    }

    console.log(`[ebay-create-listing] Creating inventory item SKU=${ebaySku}`)
    const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, inventoryItem)
    
    if (!inventoryResult.success) {
      throw new Error(inventoryResult.error)
    }

    // Create offer
    const offer: EbayOffer = {
      sku: ebaySku,
      marketplaceId: storeConfig.marketplace_id || 'EBAY_US',
      format: 'FIXED_PRICE',
      listingDescription: description,
      availableQuantity: item.quantity || 1,
      pricingSummary: {
        price: {
          value: (item.price || 0).toFixed(2),
          currency: 'USD',
        },
      },
      listingPolicies: {
        fulfillmentPolicyId: storeConfig.default_fulfillment_policy_id || '',
        paymentPolicyId: storeConfig.default_payment_policy_id || '',
        returnPolicyId: storeConfig.default_return_policy_id || '',
      },
      categoryId: storeConfig.default_category_id || '183454', // Default: Trading Cards
      merchantLocationKey: storeConfig.location_key || undefined,
    }

    console.log(`[ebay-create-listing] Creating offer for SKU=${ebaySku}`)
    const offerResult = await createOffer(accessToken, environment, offer)
    
    if (!offerResult.success) {
      throw new Error(offerResult.error)
    }

    // Publish the offer
    console.log(`[ebay-create-listing] Publishing offer=${offerResult.offerId}`)
    const publishResult = await publishOffer(accessToken, environment, offerResult.offerId!)
    
    if (!publishResult.success) {
      throw new Error(publishResult.error)
    }

    // Build listing URL
    const listingUrl = environment === 'sandbox'
      ? `https://sandbox.ebay.com/itm/${publishResult.listingId}`
      : `https://www.ebay.com/itm/${publishResult.listingId}`

    // Update intake item with eBay data
    const syncSnapshot = {
      timestamp: new Date().toISOString(),
      store_key,
      environment,
      sku: ebaySku,
      offer_id: offerResult.offerId,
      listing_id: publishResult.listingId,
      listing_url: listingUrl,
    }

    await supabase
      .from('intake_items')
      .update({
        ebay_inventory_item_sku: ebaySku,
        ebay_offer_id: offerResult.offerId,
        ebay_listing_id: publishResult.listingId,
        ebay_listing_url: listingUrl,
        ebay_sync_status: 'synced',
        ebay_sync_snapshot: syncSnapshot,
        ebay_sync_error: null,
        last_ebay_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intake_item_id)

    console.log(`[ebay-create-listing] Success! listing_id=${publishResult.listingId}`)

    return new Response(
      JSON.stringify({
        success: true,
        listing_id: publishResult.listingId,
        offer_id: offerResult.offerId,
        sku: ebaySku,
        listing_url: listingUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[ebay-create-listing] Error:', error)

    // Update item with error status if we have the ID
    try {
      const body = await req.clone().json()
      if (body.intake_item_id) {
        await supabase
          .from('intake_items')
          .update({
            ebay_sync_status: 'error',
            ebay_sync_error: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.intake_item_id)
      }
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function buildTitle(item: any, template?: string | null): string {
  if (template) {
    return template
      .replace('{subject}', item.subject || '')
      .replace('{brand}', item.brand_title || '')
      .replace('{year}', item.year || '')
      .replace('{grade}', item.grade || '')
      .replace('{card_number}', item.card_number || '')
      .trim()
  }

  const parts = []
  if (item.year) parts.push(item.year)
  if (item.brand_title) parts.push(item.brand_title)
  if (item.subject) parts.push(item.subject)
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (item.grade) parts.push(`PSA ${item.grade}`)
  
  return parts.join(' ') || 'Trading Card'
}

function buildDescription(item: any, template?: string | null): string {
  if (template) {
    return template
      .replace('{subject}', item.subject || '')
      .replace('{brand}', item.brand_title || '')
      .replace('{year}', item.year || '')
      .replace('{grade}', item.grade || '')
      .replace('{card_number}', item.card_number || '')
      .replace('{sku}', item.sku || '')
      .trim()
  }

  const lines = []
  lines.push(`<h2>${item.subject || 'Trading Card'}</h2>`)
  
  if (item.brand_title) lines.push(`<p><strong>Brand:</strong> ${item.brand_title}</p>`)
  if (item.year) lines.push(`<p><strong>Year:</strong> ${item.year}</p>`)
  if (item.card_number) lines.push(`<p><strong>Card #:</strong> ${item.card_number}</p>`)
  if (item.grade) lines.push(`<p><strong>Grade:</strong> PSA ${item.grade}</p>`)
  if (item.psa_cert) lines.push(`<p><strong>PSA Cert:</strong> ${item.psa_cert}</p>`)
  
  return lines.join('\n')
}
