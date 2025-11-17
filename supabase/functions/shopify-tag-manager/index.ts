import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TagOperation {
  action: 'add' | 'remove';
  tags: string[];
  productId: string;
  storeKey: string;
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

    const { action, tags, productId, storeKey }: TagOperation = await req.json();

    if (!action || !tags || !productId || !storeKey) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Shopify credentials from vault
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

    // Get current product data
    const productResponse = await fetch(
      `https://${shopifyDomain.domain}/admin/api/2024-01/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!productResponse.ok) {
      throw new Error(`Failed to fetch product: ${productResponse.statusText}`);
    }

    const productData = await productResponse.json();
    const currentTags = productData.product.tags ? productData.product.tags.split(', ') : [];

    // Update tags
    let updatedTags = [...currentTags];
    if (action === 'add') {
      updatedTags = [...new Set([...updatedTags, ...tags])];
    } else {
      updatedTags = updatedTags.filter((tag: string) => !tags.includes(tag));
    }

    // Update product with new tags
    const updateResponse = await fetch(
      `https://${shopifyDomain.domain}/admin/api/2024-01/products/${productId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product: {
            id: productId,
            tags: updatedTags.join(', '),
          },
        }),
      }
    );

    if (!updateResponse.ok) {
      throw new Error(`Failed to update product: ${updateResponse.statusText}`);
    }

    const updatedProduct = await updateResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        tags: updatedProduct.product.tags,
        action,
        appliedTags: tags,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Tag manager error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
