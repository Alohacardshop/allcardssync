import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ShopifyCredentials {
  domain: string;
  accessToken: string;
}

async function getShopifyCredentials(supabase: any, storeKey: string): Promise<ShopifyCredentials> {
  const upper = storeKey.toUpperCase();

  // Prefer system_settings (align with other Shopify functions)
  const domainKeys = [
    `SHOPIFY_${upper}_STORE_DOMAIN`, // per-store
    'SHOPIFY_STORE_DOMAIN'           // global fallback
  ];
  const tokenKeys = [
    `SHOPIFY_${upper}_ACCESS_TOKEN`,           // current standard
    `SHOPIFY_ADMIN_ACCESS_TOKEN_${upper}`,     // legacy pattern A
    `SHOPIFY_${upper}_ADMIN_ACCESS_TOKEN`,     // legacy pattern B
    'SHOPIFY_ADMIN_ACCESS_TOKEN',              // global fallback
    `SHOPIFY_ACCESS_TOKEN_${upper}`            // legacy (our initial attempt)
  ];

  // Helper to read first non-empty value
  const getSetting = async (keys: string[]) => {
    for (const key of keys) {
      const { data } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', key)
        .single();
      const val = data?.key_value?.trim();
      if (val) return val;
    }
    return undefined;
  };

  let domain = await getSetting(domainKeys);
  let accessToken = await getSetting(tokenKeys);

  // Fallback domain from shopify_stores table if not set in settings
  if (!domain) {
    const { data: storeData } = await supabase
      .from('shopify_stores')
      .select('domain')
      .eq('key', storeKey)
      .single();
    domain = storeData?.domain;
  }

  if (!domain) throw new Error(`Store domain not found for store: ${storeKey}`);
  if (!accessToken) throw new Error(`Access token not found for store: ${storeKey}`);

  return { domain, accessToken };
}

async function inspectSkuInShopify(credentials: ShopifyCredentials, sku: string) {
  const query = `
    query($query: String!) {
      productVariants(first: 5, query: $query) {
        edges {
          node {
            id
            sku
            title
            price
            inventoryQuantity
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 10) {
                edges {
                  node {
                    location {
                      id
                      name
                    }
                    available
                  }
                }
              }
            }
            product {
              id
              title
              status
              handle
              publishedAt
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${credentials.domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': credentials.accessToken,
    },
    body: JSON.stringify({
      query,
      variables: { query: `sku:${sku}` }
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data.productVariants.edges.map((edge: any) => ({
    variantId: edge.node.id,
    sku: edge.node.sku,
    variantTitle: edge.node.title,
    price: edge.node.price,
    inventoryQuantity: edge.node.inventoryQuantity,
    inventoryItemId: edge.node.inventoryItem.id,
    tracked: edge.node.inventoryItem.tracked,
    productId: edge.node.product.id,
    productTitle: edge.node.product.title,
    productStatus: edge.node.product.status,
    productHandle: edge.node.product.handle,
    publishedAt: edge.node.product.publishedAt,
    inventoryLevels: edge.node.inventoryItem.inventoryLevels.edges.map((level: any) => ({
      locationId: level.node.location.id,
      locationName: level.node.location.name,
      available: level.node.available
    }))
  }));
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
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Check if user has admin or staff role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);

    const hasAccess = roles?.some(r => ['admin', 'staff'].includes(r.role));
    if (!hasAccess) {
      return new Response('Forbidden: Admin or staff role required', { 
        status: 403, 
        headers: corsHeaders 
      });
    }

    const { storeKey, sku } = await req.json();

    if (!storeKey || !sku) {
      return new Response('Missing storeKey or sku', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    console.log(`Inspecting SKU ${sku} in store ${storeKey}`);

    // Get Shopify credentials
    const credentials = await getShopifyCredentials(supabase, storeKey);
    
    // Inspect SKU in Shopify
    const variants = await inspectSkuInShopify(credentials, sku);

    console.log(`Found ${variants.length} variants for SKU ${sku}`);

    return new Response(JSON.stringify({
      success: true,
      sku,
      storeKey,
      variantsFound: variants.length,
      variants
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Shopify inspect error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});