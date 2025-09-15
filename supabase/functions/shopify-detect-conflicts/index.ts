import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ConflictDetectionRequest {
  storeKey: string
  itemIds?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { storeKey, itemIds }: ConflictDetectionRequest = await req.json()

    console.log(`🔍 Detecting conflicts for store ${storeKey}`)

    // Get items to check
    let query = supabase
      .from('intake_items')
      .select('*')
      .eq('store_key', storeKey)
      .not('shopify_product_id', 'is', null) // Only check items that exist in Shopify

    if (itemIds && itemIds.length > 0) {
      query = query.in('id', itemIds)
    }

    const { data: items, error: itemsError } = await query.limit(100)

    if (itemsError) throw itemsError

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ conflicts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Shopify credentials
    const { data: tokenData, error: tokenError } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`)
      .single()

    if (tokenError) throw new Error(`Access token not found: ${tokenError.message}`)

    const { data: storeData, error: storeError } = await supabase
      .from('shopify_stores')
      .select('domain')
      .eq('key', storeKey)
      .single()

    if (storeError) throw new Error(`Store not found: ${storeError.message}`)

    const shopifyDomain = storeData.domain
    const accessToken = tokenData.key_value

    // Check each item for conflicts
    const conflicts = []

    for (const item of items) {
      if (!item.shopify_product_id || !item.shopify_variant_id) continue

      try {
        // Get current Shopify data
        const productQuery = `
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              title
              updatedAt
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                    inventoryQuantity
                    updatedAt
                  }
                }
              }
            }
          }
        `

        const response = await fetch(`https://${shopifyDomain}/admin/api/2024-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ 
            query: productQuery, 
            variables: { id: item.shopify_product_id } 
          })
        })

        const data = await response.json()
        const product = data.data?.product

        if (!product) continue

        const variant = product.variants.edges.find(
          (v: any) => v.node.id === item.shopify_variant_id
        )

        if (!variant) continue

        const shopifyVariant = variant.node
        const conflictTypes = []
        const suggestions = []

        // Check for price conflicts
        const localPrice = item.price || 0
        const shopifyPrice = parseFloat(shopifyVariant.price)
        const priceDiff = Math.abs(localPrice - shopifyPrice)

        if (priceDiff > 0.01) {
          conflictTypes.push('price')
        }

        // Check for quantity conflicts
        const localQuantity = item.quantity || 0
        const shopifyQuantity = shopifyVariant.inventoryQuantity || 0
        
        if (localQuantity !== shopifyQuantity) {
          conflictTypes.push('quantity')
        }

        // Check for title conflicts
        const localTitle = item.title || `${item.brand_title} ${item.subject}`.trim()
        const shopifyTitle = product.title

        if (localTitle && shopifyTitle && localTitle !== shopifyTitle) {
          conflictTypes.push('title')
        }

        // Only create conflict if there are actual differences
        if (conflictTypes.length > 0) {
          // Generate suggestions based on conflict type
          if (conflictTypes.includes('price')) {
            if (priceDiff > localPrice * 0.1) {
              suggestions.push({
                action: 'use_local',
                description: `Use local price ($${localPrice.toFixed(2)})`,
                impact: 'Will update Shopify pricing'
              })
              suggestions.push({
                action: 'use_shopify',
                description: `Keep Shopify price ($${shopifyPrice.toFixed(2)})`,
                impact: 'Will update local system pricing'
              })
            } else {
              suggestions.push({
                action: 'use_local',
                description: 'Minor price difference - use local',
                impact: 'Small price adjustment in Shopify'
              })
            }
          }

          if (conflictTypes.includes('quantity')) {
            const qtyDiff = Math.abs(localQuantity - shopifyQuantity)
            if (qtyDiff > 5) {
              suggestions.push({
                action: 'use_local',
                description: `Use local quantity (${localQuantity})`,
                impact: 'Large inventory adjustment in Shopify'
              })
              suggestions.push({
                action: 'use_shopify',
                description: `Keep Shopify quantity (${shopifyQuantity})`,
                impact: 'Large inventory adjustment locally'
              })
            } else {
              suggestions.push({
                action: 'use_local',
                description: 'Use local quantity',
                impact: 'Minor inventory adjustment'
              })
            }
          }

          if (suggestions.length === 0) {
            suggestions.push({
              action: 'use_local',
              description: 'Use local system values',
              impact: 'Update Shopify with local data'
            })
          }

          conflicts.push({
            itemId: item.id,
            sku: item.sku,
            localData: {
              title: localTitle,
              price: localPrice,
              quantity: localQuantity,
              lastUpdated: item.updated_at
            },
            shopifyData: {
              productId: item.shopify_product_id,
              variantId: item.shopify_variant_id,
              title: shopifyTitle,
              price: shopifyPrice,
              quantity: shopifyQuantity,
              lastUpdated: shopifyVariant.updatedAt
            },
            conflictType: conflictTypes.length > 1 ? 'multiple' : conflictTypes[0],
            suggestions
          })
        }

      } catch (error) {
        console.error(`Error checking item ${item.id}:`, error)
      }
    }

    console.log(`✅ Found ${conflicts.length} conflicts`)

    return new Response(
      JSON.stringify({ conflicts }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Conflict detection error:', error)
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