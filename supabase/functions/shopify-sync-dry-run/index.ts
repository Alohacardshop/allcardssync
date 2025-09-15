import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface DryRunRequest {
  storeKey: string
  locationGid: string
  itemIds: string[]
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

    const { storeKey, locationGid, itemIds }: DryRunRequest = await req.json()

    console.log(`🔍 Dry run for ${itemIds.length} items in store ${storeKey}`)

    // Get items to analyze
    const { data: items, error: itemsError } = await supabase
      .from('intake_items')
      .select('*')
      .in('id', itemIds)
      .eq('store_key', storeKey)

    if (itemsError) throw itemsError

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

    // Analyze each item
    const analyzedItems = []

    for (const item of items || []) {
      const analysis = {
        id: item.id,
        sku: item.sku,
        title: item.title || `${item.brand_title} ${item.subject}`.trim(),
        quantity: item.quantity || 0,
        price: item.price || 0,
        currentShopifyStatus: item.shopify_sync_status || 'not_synced',
        estimatedChanges: {
          willCreate: false,
          willUpdate: false,
          willDelete: false,
          changes: [] as string[]
        },
        riskLevel: 'low' as 'low' | 'medium' | 'high'
      }

      try {
        // Check if product exists in Shopify by SKU
        const searchQuery = `
          query searchProductsBySku($query: String!) {
            products(first: 5, query: $query) {
              edges {
                node {
                  id
                  title
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        sku
                        price
                        inventoryQuantity
                        barcode
                      }
                    }
                  }
                }
              }
            }
          }
        `

        const searchResponse = await fetch(`https://${shopifyDomain}/admin/api/2024-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ 
            query: searchQuery, 
            variables: { query: `sku:${item.sku}` } 
          })
        })

        const searchData = await searchResponse.json()
        const existingProducts = searchData.data?.products?.edges || []

        if (existingProducts.length === 0) {
          // Will create new product
          analysis.estimatedChanges.willCreate = true
          analysis.estimatedChanges.changes.push('Create new product in Shopify')
          analysis.estimatedChanges.changes.push(`Set initial quantity to ${item.quantity}`)
          analysis.estimatedChanges.changes.push(`Set price to $${item.price}`)
          
          if (item.quantity > 10) {
            analysis.riskLevel = 'medium'
            analysis.estimatedChanges.changes.push('⚠️ High quantity - verify inventory accuracy')
          }
        } else {
          // Product exists - will update
          analysis.estimatedChanges.willUpdate = true
          
          const existingVariant = existingProducts[0].node.variants.edges.find(
            (v: any) => v.node.sku === item.sku
          )

          if (existingVariant) {
            const variant = existingVariant.node
            
            // Compare prices
            const currentPrice = parseFloat(variant.price)
            if (Math.abs(currentPrice - item.price) > 0.01) {
              analysis.estimatedChanges.changes.push(
                `Update price: $${currentPrice} → $${item.price}`
              )
              if (Math.abs(currentPrice - item.price) > currentPrice * 0.2) {
                analysis.riskLevel = 'high'
                analysis.estimatedChanges.changes.push('⚠️ Price change >20% - verify pricing')
              }
            }

            // Compare quantities
            const currentQty = variant.inventoryQuantity || 0
            if (currentQty !== item.quantity) {
              analysis.estimatedChanges.changes.push(
                `Update quantity: ${currentQty} → ${item.quantity}`
              )
              if (Math.abs(currentQty - item.quantity) > 5) {
                analysis.riskLevel = 'medium'
                analysis.estimatedChanges.changes.push('⚠️ Large quantity change - verify accuracy')
              }
            }

            // Check for barcode conflicts (graded items)
            if (item.type === 'Graded' && item.psa_cert) {
              if (variant.barcode && variant.barcode !== item.psa_cert) {
                analysis.estimatedChanges.changes.push(
                  `Update barcode: ${variant.barcode} → ${item.psa_cert}`
                )
                analysis.riskLevel = 'high'
                analysis.estimatedChanges.changes.push('⚠️ Barcode conflict - may affect graded card tracking')
              }
            }

            if (analysis.estimatedChanges.changes.length === 1) {
              analysis.estimatedChanges.changes.push('No significant changes detected')
            }
          }
        }

        // Check for deletion scenario
        if (item.quantity === 0 && item.deleted_at) {
          analysis.estimatedChanges.willDelete = true
          analysis.estimatedChanges.willUpdate = false
          analysis.estimatedChanges.willCreate = false
          analysis.estimatedChanges.changes = ['Delete product from Shopify']
          analysis.riskLevel = 'high'
          analysis.estimatedChanges.changes.push('⚠️ Permanent deletion - cannot be undone')
        }

      } catch (error) {
        console.error(`Error analyzing item ${item.id}:`, error)
        analysis.estimatedChanges.changes.push(`Error analyzing: ${error}`)
        analysis.riskLevel = 'high'
      }

      analyzedItems.push(analysis)
    }

    const result = {
      success: true,
      items: analyzedItems,
      summary: {
        total: analyzedItems.length,
        willCreate: analyzedItems.filter(item => item.estimatedChanges.willCreate).length,
        willUpdate: analyzedItems.filter(item => item.estimatedChanges.willUpdate).length,
        willDelete: analyzedItems.filter(item => item.estimatedChanges.willDelete).length,
        lowRisk: analyzedItems.filter(item => item.riskLevel === 'low').length,
        mediumRisk: analyzedItems.filter(item => item.riskLevel === 'medium').length,
        highRisk: analyzedItems.filter(item => item.riskLevel === 'high').length,
      }
    }

    console.log('✅ Dry run completed:', result.summary)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Dry run error:', error)
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