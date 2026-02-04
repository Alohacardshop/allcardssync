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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { itemId, storeKey, updates }: ProductUpdateRequest = await req.json();

    if (!itemId || !storeKey || !updates) {
      return new Response(JSON.stringify({ error: 'Missing required fields: itemId, storeKey, updates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the intake item to find Shopify IDs
    const { data: item, error: itemError } = await supabase
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

    // Get Shopify credentials
    const { data: shopifyToken } = await supabase.rpc('get_decrypted_secret', {
      secret_name: `SHOPIFY_${storeKey.toUpperCase()}_ACCESS_TOKEN`
    });

    const { data: shopifyDomain } = await supabase
      .from('shopify_stores')
      .select('domain')
      .eq('key', storeKey)
      .single();

    if (!shopifyToken || !shopifyDomain) {
      return new Response(JSON.stringify({ error: 'Shopify credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productId = item.shopify_product_id;
    const variantId = item.shopify_variant_id;

    // Build product update payload
    const productPayload: Record<string, unknown> = { id: productId };
    const variantPayload: Record<string, unknown> | null = variantId ? { id: variantId } : null;

    if (updates.title !== undefined) {
      productPayload.title = updates.title;
    }

    if (updates.tags !== undefined) {
      productPayload.tags = updates.tags.join(', ');
    }

    // Price updates go to the variant
    if (updates.price !== undefined && variantPayload) {
      variantPayload.price = updates.price.toFixed(2);
      productPayload.variants = [variantPayload];
    }

    console.log(`shopify-update-product: Updating product ${productId}`, {
      itemId,
      storeKey,
      updates: Object.keys(updates)
    });

    // Update product in Shopify
    const updateResponse = await fetch(
      `https://${shopifyDomain.domain}/admin/api/2024-01/products/${productId}.json`,
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
    await supabase
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
