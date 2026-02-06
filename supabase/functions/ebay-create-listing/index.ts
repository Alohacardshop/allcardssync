import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, requireRole, requireStoreAccess } from '../_shared/auth.ts'
import {
  getValidAccessToken,
  createOrUpdateInventoryItem,
  createOffer,
  publishOffer,
  type EbayInventoryItem,
  type EbayOffer,
} from '../_shared/ebayApi.ts'
import {
  EBAY_CONDITION_IDS,
  buildGradedConditionDescriptors,
  detectCategoryFromBrand,
  getEbayCategoryId,
  buildTradingCardAspects,
} from '../_shared/ebayConditions.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateListingRequest {
  intake_item_id: string
  store_key: string
  template_id?: string // Optional: use specific template
}

interface ListingTemplate {
  id: string
  category_id: string
  category_name: string | null
  condition_id: string
  is_graded: boolean
  title_template: string | null
  description_template: string | null
  default_grader: string | null
  aspects_mapping: Record<string, any>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user and require staff/admin role
    const user = await requireAuth(req)
    await requireRole(user.id, ['admin', 'staff'])

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { intake_item_id, store_key, template_id }: CreateListingRequest = await req.json()

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

    // Get listing template
    let template: ListingTemplate | null = null
    
    if (template_id) {
      // Use specified template
      const { data: templateData } = await supabase
        .from('ebay_listing_templates')
        .select('*')
        .eq('id', template_id)
        .single()
      template = templateData
    } else {
      // Auto-detect template based on category mappings
      const detectedCategory = detectCategoryFromBrand(item.brand_title) || item.main_category
      const isGraded = !!item.grade
      
      // Find matching template
      const { data: templates } = await supabase
        .from('ebay_listing_templates')
        .select('*')
        .eq('store_key', store_key)
        .eq('is_graded', isGraded)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
      
      if (templates && templates.length > 0) {
        // Try to find a template for the detected category
        template = templates.find(t => {
          if (detectedCategory === 'tcg' && t.category_id === '183454') return true
          if (detectedCategory === 'sports' && t.category_id === '261328') return true
          if (detectedCategory === 'comics' && (t.category_id === '63' || t.category_id === '259061')) return true
          return false
        }) || templates[0] // Fallback to first/default
      }
    }

    console.log(`[ebay-create-listing] Using template: ${template?.id || 'none'}, isGraded: ${!!item.grade}`)

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, store_key, environment)

    // Build eBay SKU (use existing SKU or generate)
    const ebaySku = item.sku || `INV-${item.id.substring(0, 8)}`

    // Determine condition and category
    const isGraded = !!item.grade
    const conditionId = template?.condition_id || (isGraded ? EBAY_CONDITION_IDS.GRADED : EBAY_CONDITION_IDS.UNGRADED)
    const categoryId = template?.category_id || 
      getEbayCategoryId(detectCategoryFromBrand(item.brand_title) || item.main_category as any, isGraded)

    // Build title from item data
    const title = buildTitle(item, template?.title_template || storeConfig.title_template)

    // Build description
    const description = buildDescription(item, template?.description_template || storeConfig.description_template)

    // Build aspects for trading cards
    const aspects = buildTradingCardAspects(item)

    // Build condition descriptors for graded items
    let conditionDescriptors: any[] | undefined
    if (isGraded) {
      conditionDescriptors = buildGradedConditionDescriptors(
        item.grading_company || template?.default_grader || 'PSA',
        item.grade,
        item.psa_cert || item.cgc_cert
      )
    }

    // Create inventory item with condition descriptors
    const inventoryItem: EbayInventoryItem & { conditionDescriptors?: any[] } = {
      sku: ebaySku,
      product: {
        title: title.substring(0, 80), // eBay title limit
        description: description,
        aspects: aspects,
        imageUrls: item.image_urls || [],
      },
      condition: conditionId,
      availability: {
        shipToLocationAvailability: {
          quantity: item.quantity || 1,
        },
      },
    }

    // Add condition descriptors for graded items
    if (conditionDescriptors && conditionDescriptors.length > 0) {
      inventoryItem.conditionDescriptors = conditionDescriptors
    }

    console.log(`[ebay-create-listing] Creating inventory item SKU=${ebaySku} condition=${conditionId} category=${categoryId}`)
    console.log(`[ebay-create-listing] Condition descriptors:`, JSON.stringify(conditionDescriptors))
    
    const inventoryResult = await createOrUpdateInventoryItem(accessToken, environment, inventoryItem)
    
    if (!inventoryResult.success) {
      throw new Error(inventoryResult.error)
    }

    // Calculate price with markup
    const basePrice = item.price || 0
    const markupPercent = storeConfig.price_markup_percent || 0
    const finalPrice = basePrice * (1 + markupPercent / 100)

    console.log(`[ebay-create-listing] Price: base=${basePrice}, markup=${markupPercent}%, final=${finalPrice.toFixed(2)}`)

    // Create offer
    const offer: EbayOffer = {
      sku: ebaySku,
      marketplaceId: storeConfig.marketplace_id || 'EBAY_US',
      format: 'FIXED_PRICE',
      listingDescription: description,
      availableQuantity: item.quantity || 1,
      pricingSummary: {
        price: {
          value: finalPrice.toFixed(2),
          currency: 'USD',
        },
      },
      listingPolicies: {
        fulfillmentPolicyId: storeConfig.default_fulfillment_policy_id || '',
        paymentPolicyId: storeConfig.default_payment_policy_id || '',
        returnPolicyId: storeConfig.default_return_policy_id || '',
      },
      categoryId: categoryId,
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
      template_id: template?.id,
      category_id: categoryId,
      condition_id: conditionId,
      condition_descriptors: conditionDescriptors,
      aspects: aspects,
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
        template_used: template?.id,
        category_id: categoryId,
        condition_id: conditionId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[ebay-create-listing] Error:', error)

    // Handle authentication errors
    if (error.message?.includes('Authorization') || error.message?.includes('authentication') || error.message?.includes('permissions')) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update item with error status if we have the ID
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      
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
      .replace(/{subject}/g, item.subject || '')
      .replace(/{brand_title}/g, item.brand_title || '')
      .replace(/{brand}/g, item.brand_title || '')
      .replace(/{year}/g, item.year || '')
      .replace(/{grade}/g, item.grade || '')
      .replace(/{grading_company}/g, item.grading_company || '')
      .replace(/{card_number}/g, item.card_number || '')
      .replace(/{variant}/g, item.variant || '')
      .replace(/{psa_cert}/g, item.psa_cert || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const parts = []
  if (item.year) parts.push(item.year)
  if (item.brand_title) parts.push(item.brand_title)
  if (item.subject) parts.push(item.subject)
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (item.grade && item.grading_company) {
    parts.push(`${item.grading_company} ${item.grade}`)
  } else if (item.grade) {
    parts.push(`PSA ${item.grade}`)
  }
  
  return parts.join(' ') || 'Trading Card'
}

function buildDescription(item: any, template?: string | null): string {
  if (template) {
    return template
      .replace(/{subject}/g, item.subject || '')
      .replace(/{brand_title}/g, item.brand_title || '')
      .replace(/{brand}/g, item.brand_title || '')
      .replace(/{year}/g, item.year || '')
      .replace(/{grade}/g, item.grade || '')
      .replace(/{grading_company}/g, item.grading_company || '')
      .replace(/{card_number}/g, item.card_number || '')
      .replace(/{variant}/g, item.variant || '')
      .replace(/{sku}/g, item.sku || '')
      .replace(/{psa_cert}/g, item.psa_cert || '')
      .replace(/{cgc_cert}/g, item.cgc_cert || '')
      .trim()
  }

  const lines = []
  lines.push(`<h2>${item.subject || 'Trading Card'}</h2>`)
  
  if (item.brand_title) lines.push(`<p><strong>Brand:</strong> ${item.brand_title}</p>`)
  if (item.year) lines.push(`<p><strong>Year:</strong> ${item.year}</p>`)
  if (item.card_number) lines.push(`<p><strong>Card #:</strong> ${item.card_number}</p>`)
  if (item.variant) lines.push(`<p><strong>Variant:</strong> ${item.variant}</p>`)
  if (item.grade) {
    const grader = item.grading_company || 'PSA'
    lines.push(`<p><strong>Grade:</strong> ${grader} ${item.grade}</p>`)
  }
  if (item.psa_cert) lines.push(`<p><strong>PSA Cert:</strong> ${item.psa_cert}</p>`)
  if (item.cgc_cert) lines.push(`<p><strong>CGC Cert:</strong> ${item.cgc_cert}</p>`)
  
  return lines.join('\n')
}
