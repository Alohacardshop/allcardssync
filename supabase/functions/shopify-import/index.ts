import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})

async function searchVariantBySku(domain: string, accessToken: string, sku: string) {
  const response = await fetch(`https://${domain}/admin/api/2024-07/variants.json?sku=${encodeURIComponent(sku)}&limit=1`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to search variants: ${response.status}`)
  }

  const data = await response.json()
  return data.variants?.[0] || null
}

async function createProduct(domain: string, accessToken: string, item: any) {
  const productData = {
    product: {
      title: item.title || item.subject || 'Untitled Item',
      body_html: item.description || item.title || item.subject || '',
      status: 'active',
      variants: [{
        title: 'Default Title',
        price: (item.price || 0).toString(),
        sku: item.sku,
        barcode: item.barcode || item.sku,
        inventory_management: 'shopify',
        inventory_policy: 'deny'
      }]
    }
  }

  const response = await fetch(`https://${domain}/admin/api/2024-07/products.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(productData)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create product: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  return result.product
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { items, storeKey, locationGid } = await req.json()

    if (!items || !Array.isArray(items) || !storeKey) {
      return json(400, {
        ok: false,
        code: 'MISSING_PARAMS',
        message: 'Missing required parameters: items (array) and storeKey'
      })
    }

    console.log(`shopify-import: Processing ${items.length} items for store ${storeKey}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get Shopify credentials
    const configResult = await resolveShopifyConfig(supabase, storeKey)
    if (!configResult.ok) {
      return json(400, configResult)
    }

    const { credentials } = configResult
    const results = []
    let successCount = 0
    let errorCount = 0

    for (const item of items) {
      try {
        console.log(`Processing item ${item.id} with SKU: ${item.sku}`)

        if (!item.sku) {
          throw new Error('Item missing SKU')
        }

        let productId, variantId, inventoryItemId

        // Search for existing variant by SKU
        const existingVariant = await searchVariantBySku(
          credentials.domain, 
          credentials.accessToken, 
          item.sku
        )

        if (existingVariant) {
          // Reuse existing variant
          productId = existingVariant.product_id
          variantId = existingVariant.id
          inventoryItemId = existingVariant.inventory_item_id
          console.log(`Found existing variant ${variantId} for SKU ${item.sku}`)
        } else {
          // Create new product with single variant
          const newProduct = await createProduct(
            credentials.domain, 
            credentials.accessToken, 
            item
          )
          productId = newProduct.id
          variantId = newProduct.variants[0].id
          inventoryItemId = newProduct.variants[0].inventory_item_id
          console.log(`Created new product ${productId} with variant ${variantId}`)
        }

        // Update intake_items with Shopify IDs
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            shopify_product_id: productId.toString(),
            shopify_variant_id: variantId.toString(),
            shopify_inventory_item_id: inventoryItemId.toString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        if (updateError) {
          throw new Error(`Failed to update intake_items: ${updateError.message}`)
        }

        results.push({
          id: item.id,
          sku: item.sku,
          success: true,
          shopify_product_id: productId,
          shopify_variant_id: variantId,
          shopify_inventory_item_id: inventoryItemId,
          action: existingVariant ? 'reused_existing' : 'created_new'
        })

        successCount++

        // If locationGid provided, trigger inventory sync
        if (locationGid) {
          console.log(`Triggering inventory sync for SKU ${item.sku} at location ${locationGid}`)
          
          try {
            const { error: syncError } = await supabase.functions.invoke('shopify-sync-inventory', {
              body: {
                storeKey,
                sku: item.sku,
                locationGid
              }
            })

            if (syncError) {
              console.warn(`Inventory sync failed for SKU ${item.sku}:`, syncError)
              // Don't fail the import, just log the warning
            }
          } catch (syncError) {
            console.warn(`Inventory sync error for SKU ${item.sku}:`, syncError)
          }
        }

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error)
        
        results.push({
          id: item.id,
          sku: item.sku,
          success: false,
          error: error.message
        })
        
        errorCount++
      }
    }

    const response = {
      ok: true,
      processed: items.length,
      success: successCount,
      errors: errorCount,
      results,
      locationGid: locationGid || null
    }

    console.log(`shopify-import: Completed - ${successCount} success, ${errorCount} errors`)
    return json(200, response)

  } catch (error) {
    console.error('shopify-import: Fatal error:', error)
    return json(500, {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: error.message
    })
  }
})