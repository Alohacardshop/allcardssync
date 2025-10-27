import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ConflictResolutionRequest {
  itemId: string
  resolution: 'use_local' | 'use_shopify' | 'manual_merge'
  mergeData?: any
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // JWT validation for mutating endpoint
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('❌ Missing or invalid Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    // Verify JWT token
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Invalid JWT token:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Authenticated user:', user.id);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { itemId, resolution, mergeData }: ConflictResolutionRequest = await req.json()

    console.log(`🔧 Resolving conflict for item ${itemId} with resolution: ${resolution}`)

    // Get the item
    const { data: item, error: itemError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (itemError || !item) {
      throw new Error(`Item not found: ${itemError?.message}`)
    }

    if (resolution === 'use_local') {
      // Queue item for sync to push local changes to Shopify
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: itemId,
        sync_action: 'update'
      })

      if (queueError) throw queueError

      console.log(`📤 Queued item ${itemId} to sync local changes to Shopify`)

    } else if (resolution === 'use_shopify') {
      // Fetch current Shopify data and update local item
      if (!item.shopify_product_id || !item.shopify_variant_id) {
        throw new Error('Missing Shopify IDs for item')
      }

      // Get Shopify credentials
      const { data: tokenData, error: tokenError } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', `SHOPIFY_${item.store_key.toUpperCase()}_ACCESS_TOKEN`)
        .single()

      if (tokenError) throw new Error(`Access token not found: ${tokenError.message}`)

      const { data: storeData, error: storeError } = await supabase
        .from('shopify_stores')
        .select('domain')
        .eq('key', item.store_key)
        .single()

      if (storeError) throw new Error(`Store not found: ${storeError.message}`)

      const shopifyDomain = storeData.domain
      const accessToken = tokenData.key_value

      // Get current Shopify data
      const productQuery = `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
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

      if (!product) {
        throw new Error('Product not found in Shopify')
      }

      const variant = product.variants.edges.find(
        (v: any) => v.node.id === item.shopify_variant_id
      )

      if (!variant) {
        throw new Error('Variant not found in Shopify')
      }

      const shopifyVariant = variant.node

      // Update local item with Shopify data
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          title: product.title,
          price: parseFloat(shopifyVariant.price),
          quantity: shopifyVariant.inventoryQuantity || 0,
          shopify_sync_status: 'synced',
          last_shopify_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: 'conflict_resolution'
        })
        .eq('id', itemId)

      if (updateError) throw updateError

      console.log(`📥 Updated local item ${itemId} with Shopify data`)

    } else if (resolution === 'manual_merge') {
      // Apply manual merge data
      if (!mergeData) {
        throw new Error('Manual merge data required')
      }

      // Update local item with merged data
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({
          ...mergeData,
          shopify_sync_status: 'pending',
          updated_at: new Date().toISOString(),
          updated_by: 'conflict_resolution_manual'
        })
        .eq('id', itemId)

      if (updateError) throw updateError

      // Queue for sync to push merged changes to Shopify
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: itemId,
        sync_action: 'update'
      })

      if (queueError) throw queueError

      console.log(`🔀 Applied manual merge for item ${itemId} and queued for sync`)
    }

    // Log the resolution
    await supabase
      .from('system_logs')
      .insert({
        level: 'INFO',
        message: 'Conflict resolved',
        context: {
          itemId,
          resolution,
          mergeData,
          resolvedAt: new Date().toISOString()
        },
        source: 'conflict_resolution'
      })

    const result = {
      success: true,
      message: `Conflict resolved using ${resolution}`,
      itemId,
      resolution
    }

    console.log('✅ Conflict resolved:', result)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Conflict resolution error:', error)
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