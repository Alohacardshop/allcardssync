import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getShopifyCredentials(supabase: any, storeKey: string) {
  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('domain')
    .eq('key', storeKey)
    .single()
  
  if (error) throw new Error(`Store not found: ${error.message}`)
  
  const { data: tokenData, error: tokenError } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`)
    .single()
    
  if (tokenError) throw new Error(`Access token not found: ${tokenError.message}`)
  
  return {
    domain: store.domain,
    accessToken: tokenData.key_value
  }
}

async function shopifyGraphQL(domain: string, token: string, query: string, variables?: any) {
  const response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables })
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} - ${JSON.stringify(data)}`)
  }
  
  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`)
  }
  
  return data.data
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

    const { itemId, shopifyProductId, storeKey } = await req.json()

    console.log(`🔍 Validating sync for item ${itemId} -> Shopify product ${shopifyProductId}`)

    // Get Shopify credentials
    const credentials = await getShopifyCredentials(supabase, storeKey)

    // Query Shopify product
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          status
          variants(first: 1) {
            edges {
              node {
                id
                price
                inventoryQuantity
                sku
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `

    const variables = {
      id: shopifyProductId
    }

    let shopifyData = null
    let shopifyExists = false
    
    try {
      const result = await shopifyGraphQL(credentials.domain, credentials.accessToken, query, variables)
      
      if (result.product) {
        shopifyExists = true
        shopifyData = result.product
        console.log(`✅ Found Shopify product: ${result.product.title}`)
      } else {
        console.log(`❌ Shopify product not found: ${shopifyProductId}`)
      }
    } catch (error: any) {
      console.log(`❌ Error fetching Shopify product: ${error.message}`)
      // Don't throw here, we'll report this as validation failure
    }

    // Extract Shopify data for comparison
    let shopifyPrice = null
    let shopifyQuantity = null
    let shopifyTitle = null
    let shopifySku = null

    if (shopifyExists && shopifyData?.variants?.edges?.length > 0) {
      const variant = shopifyData.variants.edges[0].node
      shopifyPrice = parseFloat(variant.price)
      shopifyQuantity = variant.inventoryQuantity
      shopifyTitle = shopifyData.title
      shopifySku = variant.sku
    }

    const validationResult = {
      itemId,
      shopifyProductId,
      shopifyExists,
      shopifyPrice,
      shopifyQuantity,
      shopifyTitle,
      shopifySku,
      shopifyStatus: shopifyData?.status,
      validatedAt: new Date().toISOString()
    }

    console.log(`📊 Validation complete:`, validationResult)

    return new Response(
      JSON.stringify(validationResult),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('❌ Validation error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        validatedAt: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})