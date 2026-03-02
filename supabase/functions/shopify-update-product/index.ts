import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductUpdateRequest {
  itemId: string;
  storeKey: string;
  updates: {
    title?: string;
    price?: number;
    tags?: string[];
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Gateway handles JWT verification — no internal auth check needed
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { itemId, storeKey, updates }: ProductUpdateRequest = await req.json();

    if (!itemId || !storeKey || !updates) {
      return new Response(JSON.stringify({ error: 'Missing required fields: itemId, storeKey, updates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the intake item to find Shopify IDs
    const { data: item, error: itemError } = await supabaseAdmin
      .from('intake_items')
      .select('shopify_product_id, shopify_variant_id, store_key')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!item.shopify_product_id) {
      return new Response(JSON.stringify({ 
        error: 'Item not synced to Shopify',
        synced: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Shopify credentials from system_settings table
    const storeUpper = storeKey.toUpperCase();

    const { data: domainSetting } = await supabaseAdmin
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenSetting } = await supabaseAdmin
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single();

    const domain = domainSetting?.key_value;
    const shopifyToken = tokenSetting?.key_value;

    if (!shopifyToken || !domain) {
      return new Response(JSON.stringify({ error: 'Shopify credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productId = item.shopify_product_id;

    // First, fetch the current product from Shopify to get the real variant ID
    const getResponse = await fetch(
      `https://${domain}/admin/api/2024-07/products/${productId}.json?fields=id,title,variants`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error('Shopify product fetch failed:', errorText);
      throw new Error(`Failed to fetch product from Shopify: ${getResponse.statusText}`);
    }

    const currentProduct = await getResponse.json();
    const realVariantId = currentProduct.product?.variants?.[0]?.id;

    // If stored variant ID is stale, update it
    if (realVariantId && String(realVariantId) !== String(item.shopify_variant_id)) {
      console.log(`shopify-update-product: Fixing stale variant ID: ${item.shopify_variant_id} → ${realVariantId}`);
      await supabaseAdmin
        .from('intake_items')
        .update({ shopify_variant_id: String(realVariantId) })
        .eq('id', itemId);
    }

    // Build product update payload
    const productPayload: Record<string, unknown> = { id: productId };

    if (updates.title !== undefined) {
      productPayload.title = updates.title;
    }

    if (updates.tags !== undefined) {
      productPayload.tags = updates.tags.join(', ');
    }

    // Price updates go to the variant (use real variant ID from Shopify)
    if (updates.price !== undefined && realVariantId) {
      productPayload.variants = [{ id: realVariantId, price: updates.price.toFixed(2) }];
    }

    console.log(`shopify-update-product: Updating product ${productId}`, {
      itemId,
      storeKey,
      updates: Object.keys(updates),
      variantId: realVariantId
    });

    // Update product in Shopify
    const updateResponse = await fetch(
      `https://${domain}/admin/api/2024-07/products/${productId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product: productPayload }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Shopify update failed:', errorText);
      throw new Error(`Failed to update product in Shopify: ${updateResponse.statusText}`);
    }

    const updatedProduct = await updateResponse.json();

    // Update local database to track sync
    await supabaseAdmin
      .from('intake_items')
      .update({
        last_shopify_synced_at: new Date().toISOString(),
        shopify_sync_status: 'synced',
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId);

    console.log(`shopify-update-product: Successfully updated product ${productId}`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: true,
        productId,
        updatedFields: Object.keys(updates),
        shopifyTitle: updatedProduct.product.title,
        shopifyPrice: updatedProduct.product.variants?.[0]?.price
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('shopify-update-product error:', error);
    return new Response(
      JSON.stringify({ error: error.message, synced: false }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
