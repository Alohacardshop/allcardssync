import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GraphQLResponse {
  data?: {
    collection: {
      products: {
        edges: Array<{ node: { id: string } }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { storeKey, collectionGid } = await req.json();
    if (!storeKey || !collectionGid) {
      throw new Error("Missing storeKey or collectionGid parameter");
    }

    const storeKeyUpper = storeKey.toUpperCase();
    console.log(`fetch-collection-products: Fetching products for collection ${collectionGid} in store ${storeKey}`);

    // Get store-specific credentials
    const { data: domainData } = await supabase
      .from("system_settings")
      .select("key_value")
      .eq("key_name", `SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenData } = await supabase
      .from("system_settings")
      .select("key_value")
      .eq("key_name", `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)
      .single();

    const SHOPIFY_STORE_DOMAIN = domainData?.key_value;
    const SHOPIFY_ADMIN_ACCESS_TOKEN = tokenData?.key_value;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      throw new Error(`Shopify configuration not found for store '${storeKey}'`);
    }

    // Fetch products in this collection from Shopify using GraphQL
    const productIds: string[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetCollectionProducts($collectionId: ID!, $first: Int!, $after: String) {
          collection(id: $collectionId) {
            products(first: $first, after: $after) {
              edges {
                node {
                  id
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { collectionId: collectionGid, first: 250, after: cursor }
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shopify API error: ${response.status} ${text}`);
      }

      const result: GraphQLResponse = await response.json();
      
      if (result.errors && result.errors.length > 0) {
        throw new Error(`Shopify GraphQL error: ${result.errors.map(e => e.message).join(", ")}`);
      }

      if (!result.data?.collection) {
        // Collection not found
        return new Response(
          JSON.stringify({ ok: true, storeKey, collectionGid, productIds: [], count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const edges = result.data.collection.products.edges || [];
      
      // Extract numeric IDs from GIDs: "gid://shopify/Product/123" -> "123"
      for (const edge of edges) {
        const match = edge.node.id.match(/\/Product\/(\d+)$/);
        if (match) {
          productIds.push(match[1]);
        }
      }

      hasNextPage = result.data.collection.products.pageInfo.hasNextPage;
      cursor = result.data.collection.products.pageInfo.endCursor;
    }

    console.log(`fetch-collection-products: Found ${productIds.length} products in collection ${collectionGid}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        storeKey,
        collectionGid,
        productIds,
        count: productIds.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-collection-products error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
