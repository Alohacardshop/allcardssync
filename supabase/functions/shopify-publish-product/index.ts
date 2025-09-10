import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function publishProductInShopify(domain: string, accessToken: string, productId: string) {
  // GraphQL mutation to publish product to Online Store and Point of Sale
  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            title
            publishedOnCurrentPublication
          }
        }
        shop {
          publicationCount
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
    input: [
      {
        publicationId: "gid://shopify/Publication/1" // Online Store
      },
      {
        publicationId: "gid://shopify/Publication/2" // Point of Sale (usually ID 2)
      }
    ]
  };

  const response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  if (result.data?.publishablePublish?.userErrors?.length > 0) {
    throw new Error(`Publish errors: ${JSON.stringify(result.data.publishablePublish.userErrors)}`);
  }

  return result.data?.publishablePublish;
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

    const { storeKey, productId } = await req.json();

    if (!storeKey || !productId) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'MISSING_PARAMS',
        message: 'Missing storeKey or productId'
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`shopify-publish-product: Publishing product ${productId} in store ${storeKey}`);

    // Get Shopify credentials using shared resolver
    const configResult = await resolveShopifyConfig(supabase, storeKey);
    if (!configResult.ok) {
      return new Response(JSON.stringify(configResult), {
        status: configResult.code === 'MISSING_DOMAIN' || configResult.code === 'MISSING_TOKEN' ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentials, diagnostics } = configResult;
    
    // Publish product in Shopify
    const publishResult = await publishProductInShopify(credentials.domain, credentials.accessToken, productId);

    console.log(`shopify-publish-product: Successfully published product ${productId}`);

    return new Response(JSON.stringify({
      ok: true,
      productId,
      publishResult,
      diagnostics
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('shopify-publish-product: Error -', error);
    
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