import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function inspectSkuInShopify(domain: string, accessToken: string, sku: string) {
  const query = `
    query ($query: String!) {
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
                    quantities(names: ["available"]) {
                      edges { node { name quantity } }
                    }
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

  const response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
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
    const undefinedField = result.errors.some((e: any) => e?.extensions?.code === 'undefinedField');
    if (undefinedField) {
      // Fallback to REST if Shopify GraphQL schema changed
      return await restInspectSku(domain, accessToken, sku);
    }
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
    inventoryLevels: edge.node.inventoryItem.inventoryLevels.edges.map((level: any) => {
      const qtyEdge = level.node.quantities?.edges?.find((e: any) => e?.node?.name === 'available');
      const available = qtyEdge?.node?.quantity ?? (level.node as any).available ?? 0;
      return {
        locationId: level.node.location.id,
        locationName: level.node.location.name,
        available
      };
    })
  }));
}

async function restInspectSku(domain: string, accessToken: string, sku: string) {
  // REST fallback: fetch variant and inventory levels by SKU
  const variantsRes = await fetch(`https://${domain}/admin/api/2024-07/variants.json?sku=${encodeURIComponent(sku)}&limit=5`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
  });
  if (!variantsRes.ok) {
    throw new Error(`Shopify REST error (variants): ${variantsRes.status}`);
  }
  const variantsJson = await variantsRes.json();
  const restVariants = (variantsJson.variants || []) as any[];

  const results = [] as any[];
  for (const v of restVariants) {
    const invItemId = v.inventory_item_id;
    let levels: any[] = [];
    if (invItemId) {
      const levelsRes = await fetch(`https://${domain}/admin/api/2024-07/inventory_levels.json?inventory_item_ids=${encodeURIComponent(invItemId)}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
      });
      if (levelsRes.ok) {
        const levelsJson = await levelsRes.json();
        levels = levelsJson.inventory_levels || [];
      }
    }

    results.push({
      variantId: `gid://shopify/ProductVariant/${v.id}`,
      sku: v.sku,
      variantTitle: v.title,
      price: v.price,
      inventoryQuantity: v.inventory_quantity ?? null,
      inventoryItemId: `gid://shopify/InventoryItem/${invItemId}`,
      tracked: true,
      productId: `gid://shopify/Product/${v.product_id}`,
      productTitle: undefined,
      productStatus: undefined,
      productHandle: undefined,
      publishedAt: undefined,
      inventoryLevels: levels.map((lvl: any) => ({
        locationId: `gid://shopify/Location/${lvl.location_id}`,
        locationName: undefined,
        available: lvl.available ?? 0,
      })),
    });
  }

  return results;
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

    const { storeKey, sku } = await req.json();

    if (!storeKey || !sku) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'MISSING_PARAMS',
        message: 'Missing storeKey or sku'
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`shopify-inspect-sku: Inspecting SKU ${sku} in store ${storeKey}`);

    // Get Shopify credentials using shared resolver
    const configResult = await resolveShopifyConfig(supabase, storeKey);
    if (!configResult.ok) {
      if (configResult.code === 'MISSING_DOMAIN' || configResult.code === 'MISSING_TOKEN') {
        return new Response(JSON.stringify({
          ok: false,
          code: configResult.code,
          message: configResult.message,
          diagnostics: configResult.diagnostics
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(configResult), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentials, diagnostics } = configResult;
    
    // Inspect SKU in Shopify
    const variants = await inspectSkuInShopify(credentials.domain, credentials.accessToken, sku);

    console.log(`shopify-inspect-sku: Found ${variants.length} variants for SKU ${sku}`);

    if (variants.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'NOT_FOUND',
        message: `No variant with that SKU: ${sku}`,
        diagnostics
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Transform variants to match expected format
    const transformedVariants = variants.map((variant: any) => ({
      productId: variant.productId?.split('/').pop(),
      variantId: variant.variantId?.split('/').pop(),
      inventoryItemId: variant.inventoryItemId?.split('/').pop(),
      productTitle: variant.productTitle,
      productStatus: variant.productStatus,
      published: !!variant.publishedAt,
      locations: variant.inventoryLevels.map((level: any) => ({
        gid: level.locationId,
        name: level.locationName,
        available: level.available
      }))
    }));

    return new Response(JSON.stringify({
      ok: true,
      variants: transformedVariants,
      diagnostics
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('shopify-inspect-sku: Error -', error);
    
    // Map common HTTP errors
    let code = 'SHOPIFY_ERROR';
    if (error.message?.includes('401')) code = 'SHOPIFY_401';
    else if (error.message?.includes('403')) code = 'SHOPIFY_403';
    else if (error.message?.includes('404')) code = 'SHOPIFY_404';
    
    return new Response(JSON.stringify({
      ok: false,
      code,
      message: error.message
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});