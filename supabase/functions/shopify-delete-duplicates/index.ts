import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function deleteOrUnpublishProduct(domain: string, accessToken: string, productId: string, variantId: string) {
  try {
    // First try to delete the entire product
    const deleteResponse = await fetch(`https://${domain}/admin/api/2024-07/products/${productId}.json`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      }
    });

    if (deleteResponse.ok) {
      return { action: 'deleted', productId };
    }

    // If delete fails, try to unpublish and set inventory to 0
    console.log(`Failed to delete product ${productId}, trying to unpublish and zero inventory`);

    // Unpublish product
    const unpublishMutation = `
      mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          publishable {
            ... on Product {
              id
              title
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const unpublishVariables = {
      id: `gid://shopify/Product/${productId}`,
      input: [
        { publicationId: "gid://shopify/Publication/1" }, // Online Store
        { publicationId: "gid://shopify/Publication/2" }  // Point of Sale
      ]
    };

    await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: unpublishMutation,
        variables: unpublishVariables
      })
    });

    // Set inventory to 0
    const inventoryResponse = await fetch(`https://${domain}/admin/api/2024-07/variants/${variantId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        variant: {
          id: variantId,
          inventory_quantity: 0
        }
      })
    });

    return { 
      action: 'unpublished_and_zeroed', 
      productId, 
      variantId,
      inventoryUpdated: inventoryResponse.ok 
    };

  } catch (error) {
    console.error(`Error processing product ${productId}:`, error);
    return { 
      action: 'error', 
      productId, 
      error: error.message 
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'UNAUTHORIZED', 
        message: 'Authorization header required'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if user has admin or staff role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);

    const hasAccess = roles?.some(r => ['admin', 'staff'].includes(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Admin or staff role required'
      }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { storeKey, sku, variants } = await req.json();

    if (!storeKey || !sku || !variants || !Array.isArray(variants)) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'MISSING_PARAMS',
        message: 'Missing storeKey, sku, or variants'
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (variants.length <= 1) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'NO_DUPLICATES',
        message: 'No duplicates found to delete'
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`shopify-delete-duplicates: Processing ${variants.length} variants for SKU ${sku} in store ${storeKey}`);

    // Get Shopify credentials using shared resolver
    const configResult = await resolveShopifyConfig(supabase, storeKey);
    if (!configResult.ok) {
      return new Response(JSON.stringify(configResult), {
        status: !configResult.ok ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentials, diagnostics } = configResult;
    
    // Keep the first variant, delete/unpublish the rest
    const [keepVariant, ...duplicateVariants] = variants;
    
    console.log(`shopify-delete-duplicates: Keeping variant ${keepVariant.variantId}, processing ${duplicateVariants.length} duplicates`);

    const results = [];
    
    for (const variant of duplicateVariants) {
      const result = await deleteOrUnpublishProduct(
        credentials.domain, 
        credentials.accessToken, 
        variant.productId, 
        variant.variantId
      );
      results.push(result);
    }

    const deletedCount = results.filter(r => r.action === 'deleted').length;
    const unpublishedCount = results.filter(r => r.action === 'unpublished_and_zeroed').length;
    const errorCount = results.filter(r => r.action === 'error').length;

    console.log(`shopify-delete-duplicates: Completed - ${deletedCount} deleted, ${unpublishedCount} unpublished, ${errorCount} errors`);

    return new Response(JSON.stringify({
      ok: true,
      sku,
      kept: keepVariant,
      processed: duplicateVariants.length,
      results: {
        deleted: deletedCount,
        unpublished: unpublishedCount,
        errors: errorCount
      },
      details: results,
      diagnostics
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('shopify-delete-duplicates: Error -', error);
    
    return new Response(JSON.stringify({
      ok: false,
      code: 'SHOPIFY_ERROR',
      message: error.message
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
