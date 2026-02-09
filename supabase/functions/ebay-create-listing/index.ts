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
} from '../_shared/ebayConditions.ts'
import {
  resolveTemplate,
  buildCategoryAwareAspects,
  buildTitle,
  buildDescription,
} from '../_shared/ebayTemplateResolver.ts'

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
  fulfillment_policy_id: string | null
  payment_policy_id: string | null
  return_policy_id: string | null
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

    // Get listing template (with policy fields)
    // Get listing template
    let template: ListingTemplate | null = null

    if (template_id) {
      // Use specified template
      const { data: templateData } = await supabase
        .from('ebay_listing_templates')
        .select('id, category_id, category_name, condition_id, is_graded, title_template, description_template, default_grader, aspects_mapping, fulfillment_policy_id, payment_policy_id, return_policy_id')
        .eq('id', template_id)
        .single()
      template = templateData
    } else {
      // Use shared template resolution (category mappings > graded match > default)
      template = await resolveTemplate(supabase, item, store_key)
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

    // Build aspects based on detected category (TCG, sports, or comics)
    const aspects = buildCategoryAwareAspects(item)

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
        fulfillmentPolicyId: template?.fulfillment_policy_id || storeConfig.default_fulfillment_policy_id || '',
        paymentPolicyId: template?.payment_policy_id || storeConfig.default_payment_policy_id || '',
        returnPolicyId: template?.return_policy_id || storeConfig.default_return_policy_id || '',
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

// buildTitle and buildDescription are now imported from _shared/ebayTemplateResolver.ts
