import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  productsCount: { count: number };
  ruleSet?: { rules: Array<{ column: string; relation: string; condition: string }> } | null;
}

interface GraphQLResponse {
  data?: {
    collections: {
      edges: Array<{ node: ShopifyCollection }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
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

    const { storeKey, forceRefresh } = await req.json();
    if (!storeKey) throw new Error("Missing storeKey parameter");

    const storeKeyUpper = storeKey.toUpperCase();
    console.log(`fetch-shopify-collections: Fetching for store ${storeKey}`);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("shopify_collections")
        .select("*")
        .eq("store_key", storeKey)
        .order("title");
      
      // If we have cached data that's less than 5 minutes old, return it
      if (cached && cached.length > 0) {
        const newestUpdate = new Date(Math.max(...cached.map(c => new Date(c.updated_at).getTime())));
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (newestUpdate > fiveMinutesAgo) {
          console.log(`fetch-shopify-collections: Returning ${cached.length} cached collections`);
          return new Response(
            JSON.stringify({ 
              ok: true, 
              storeKey,
              count: cached.length,
              collections: cached,
              cached: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

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

    // Fetch collections from Shopify using GraphQL
    const allCollections: ShopifyCollection[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetCollections($first: Int!, $after: String) {
          collections(first: $first, after: $after) {
            edges {
              node {
                id
                title
                handle
                productsCount {
                  count
                }
                ruleSet {
                  rules {
                    column
                    relation
                    condition
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
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
          variables: { first: 250, after: cursor }
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

      const edges = result.data?.collections.edges || [];
      allCollections.push(...edges.map(e => e.node));

      hasNextPage = result.data?.collections.pageInfo.hasNextPage || false;
      cursor = result.data?.collections.pageInfo.endCursor || null;
    }

    console.log(`fetch-shopify-collections: Found ${allCollections.length} collections for ${storeKey}`);

    // Update shopify_collections cache
    const now = new Date().toISOString();
    
    for (const collection of allCollections) {
      const collectionType = collection.ruleSet?.rules && collection.ruleSet.rules.length > 0 
        ? 'smart' 
        : 'custom';
      
      const { error: upsertError } = await supabase
        .from("shopify_collections")
        .upsert({
          store_key: storeKey,
          collection_gid: collection.id,
          title: collection.title,
          handle: collection.handle,
          product_count: collection.productsCount.count,
          collection_type: collectionType,
          updated_at: now
        }, { onConflict: 'store_key,collection_gid' });
      
      if (upsertError) {
        console.error(`fetch-shopify-collections: Failed to cache collection ${collection.title}:`, upsertError);
      }
    }

    // Clean up any collections that no longer exist in Shopify
    const existingGids = allCollections.map(c => c.id);
    await supabase
      .from("shopify_collections")
      .delete()
      .eq("store_key", storeKey)
      .not("collection_gid", "in", `(${existingGids.join(",")})`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        storeKey,
        count: allCollections.length,
        collections: allCollections.map(c => ({
          collection_gid: c.id,
          title: c.title,
          handle: c.handle,
          product_count: c.productsCount.count,
          collection_type: c.ruleSet?.rules && c.ruleSet.rules.length > 0 ? 'smart' : 'custom'
        })),
        cached: false
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-shopify-collections error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
