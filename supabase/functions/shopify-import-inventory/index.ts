import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';
import { logInfo, logError } from '../_shared/log.ts';
import { resolveShopifyConfigForStore } from '../_shared/resolveShopifyConfig.ts';

interface ImportResult {
  total_found: number;
  already_synced: number;
  imported: number;
  errors: number;
  items: Array<{
    product_id: string;
    title: string;
    sku: string;
    status: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { 
      store_key, 
      location_id,
      collection_id,
      limit = 50,
      dry_run = false 
    } = await req.json();

    if (!store_key) {
      throw new Error('store_key is required');
    }

    logInfo('shopify-import', { store_key, location_id, collection_id, limit, dry_run });

    // Get Shopify config
    const shopifyConfig = await resolveShopifyConfigForStore(supabase, store_key);
    if (!shopifyConfig) {
      throw new Error(`No Shopify config found for store: ${store_key}`);
    }

    const { shopDomain, accessToken } = shopifyConfig;

    // Build GraphQL query
    let query = `{
      products(first: ${limit}) {
        edges {
          node {
            id
            title
            vendor
            productType
            tags
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryItem {
                    id
                    tracked
                  }
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`;

    // Fetch products from Shopify
    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data?.products?.edges || [];
    
    const result: ImportResult = {
      total_found: products.length,
      already_synced: 0,
      imported: 0,
      errors: 0,
      items: [],
    };

    // Process each product
    for (const edge of products) {
      const product = edge.node;
      const variants = product.variants.edges;

      for (const variantEdge of variants) {
        const variant = variantEdge.node;
        
        if (!variant.sku) {
          continue; // Skip variants without SKU
        }

        try {
          // Check if this variant already exists in our database
          const { data: existing, error: checkError } = await supabase
            .from('intake_items')
            .select('id, shopify_product_id')
            .eq('sku', variant.sku)
            .eq('store_key', store_key)
            .maybeSingle();

          if (checkError) {
            logError('check-existing-error', { sku: variant.sku, error: checkError });
            result.errors++;
            continue;
          }

          if (existing?.shopify_product_id) {
            // Already synced
            result.already_synced++;
            result.items.push({
              product_id: product.id,
              title: product.title,
              sku: variant.sku,
              status: 'already_synced',
            });
            continue;
          }

          if (!dry_run) {
            if (existing) {
              // Update existing item with Shopify IDs
              const { error: updateError } = await supabase
                .from('intake_items')
                .update({
                  shopify_product_id: product.id,
                  shopify_variant_id: variant.id,
                  shopify_inventory_item_id: variant.inventoryItem.id,
                  last_shopify_synced_at: new Date().toISOString(),
                  shopify_sync_status: 'synced',
                })
                .eq('id', existing.id);

              if (updateError) {
                logError('update-item-error', { id: existing.id, error: updateError });
                result.errors++;
                result.items.push({
                  product_id: product.id,
                  title: product.title,
                  sku: variant.sku,
                  status: 'error',
                });
              } else {
                result.imported++;
                result.items.push({
                  product_id: product.id,
                  title: product.title,
                  sku: variant.sku,
                  status: 'linked',
                });
              }
            } else {
              // No matching item in database - log for review
              logInfo('unmatched-shopify-item', {
                product_id: product.id,
                sku: variant.sku,
                title: product.title,
              });
              result.items.push({
                product_id: product.id,
                title: product.title,
                sku: variant.sku,
                status: 'not_in_database',
              });
            }
          } else {
            // Dry run - just report what would happen
            result.items.push({
              product_id: product.id,
              title: product.title,
              sku: variant.sku,
              status: existing ? 'would_link' : 'not_in_database',
            });
            if (existing) {
              result.imported++;
            }
          }
        } catch (error) {
          logError('process-variant-error', { sku: variant.sku, error: error.message });
          result.errors++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: dry_run
          ? `Dry run complete: found ${result.imported} items that would be linked`
          : `Import complete: linked ${result.imported} items`,
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logError('shopify-import-error', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});