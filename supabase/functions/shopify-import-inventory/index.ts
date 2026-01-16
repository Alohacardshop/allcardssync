import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';
import { log } from '../_lib/log.ts';
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

    // Input validation
    if (!store_key || typeof store_key !== 'string') {
      throw new Error('store_key is required and must be a string');
    }

    if (store_key.length > 50 || !/^[a-z0-9_-]+$/i.test(store_key)) {
      throw new Error('Invalid store_key format');
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 250) {
      throw new Error('limit must be between 1 and 250');
    }

    if (location_id && typeof location_id !== 'string') {
      throw new Error('location_id must be a string');
    }

    if (location_id && !location_id.startsWith('gid://shopify/Location/')) {
      throw new Error('location_id must start with gid://shopify/Location/');
    }

    if (collection_id && typeof collection_id !== 'string') {
      throw new Error('collection_id must be a string');
    }

    if (collection_id && !collection_id.startsWith('gid://shopify/Collection/')) {
      throw new Error('collection_id must start with gid://shopify/Collection/');
    }

    if (typeof dry_run !== 'boolean') {
      throw new Error('dry_run must be a boolean');
    }

    log.info('shopify-import', { store_key, location_id, collection_id, limit, dry_run });

    // Get Shopify config
    const shopifyConfig = await resolveShopifyConfigForStore(supabase, store_key);
    if (!shopifyConfig) {
      throw new Error(`No Shopify config found for store: ${store_key}`);
    }

    const { shopDomain, accessToken } = shopifyConfig;

    // Build GraphQL query with optional filters and validation
    let queryFilter = '';
    
    // Add collection filter if provided (sanitize input)
    if (collection_id) {
      const collectionNumId = collection_id.replace('gid://shopify/Collection/', '');
      if (!/^\d+$/.test(collectionNumId)) {
        throw new Error('Invalid collection_id format - must be numeric after gid prefix');
      }
      queryFilter = `, query: "collection_id:${collectionNumId}"`;
    }
    
    // Validate limit is within Shopify's GraphQL limits
    const safeLimit = Math.min(Math.max(1, limit), 250);
    
    let query = `{
      products(first: ${safeLimit}${queryFilter}) {
        edges {
          node {
            id
            title
            vendor
            productType
            tags
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  price
                  barcode
                  inventoryItem {
                    id
                    tracked
                    inventoryLevels(first: 5) {
                      edges {
                        node {
                          id
                          available
                          location {
                            id
                            name
                          }
                        }
                      }
                    }
                  }
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`;

    log.info('shopify-import-graphql', { 
      query: queryFilter || 'no filter', 
      limit: safeLimit,
      has_location_filter: !!location_id 
    });

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
      const errorText = await response.text();
      log.error('shopify-api-error', { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      });
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      log.error('shopify-graphql-errors', { errors: data.errors });
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    // Validate response structure
    if (!data.data || !data.data.products) {
      throw new Error('Invalid Shopify API response structure');
    }

    const products = data.data.products.edges || [];
    
    const result: ImportResult = {
      total_found: products.length,
      already_synced: 0,
      imported: 0,
      errors: 0,
      items: [],
    };

    // Process each product with safety checks
    for (const edge of products) {
      if (!edge || !edge.node) {
        log.error('invalid-product-edge', { edge });
        continue;
      }

      const product = edge.node;
      
      // Validate required product fields
      if (!product.id || !product.title) {
        log.error('invalid-product-data', { product_id: product?.id });
        result.errors++;
        continue;
      }

      if (!product.variants || !product.variants.edges) {
        log.error('product-missing-variants', { product_id: product.id });
        continue;
      }

      const variants = product.variants.edges;

      for (const variantEdge of variants) {
        if (!variantEdge || !variantEdge.node) {
          continue;
        }

        const variant = variantEdge.node;
        
        // Validate required variant fields
        if (!variant.sku || !variant.id) {
          log.info('variant-missing-required-fields', { 
            product_id: product.id,
            variant_id: variant?.id,
            has_sku: !!variant?.sku 
          });
          continue;
        }

        // Validate SKU format (basic sanitization)
        if (variant.sku.length > 255 || !/^[\w\-\.]+$/.test(variant.sku)) {
          log.error('invalid-sku-format', { 
            sku: variant.sku,
            product_id: product.id 
          });
          result.errors++;
          continue;
        }

        // Validate inventory item exists
        if (!variant.inventoryItem || !variant.inventoryItem.id) {
          log.error('variant-missing-inventory-item', { 
            sku: variant.sku,
            variant_id: variant.id 
          });
          result.errors++;
          continue;
        }

        // Filter by location if specified
        if (location_id) {
          const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
          const hasLocation = inventoryLevels.some(
            (level: any) => {
              try {
                return level?.node?.location?.id === location_id;
              } catch (e) {
                return false;
              }
            }
          );
          
          if (!hasLocation) {
            continue; // Skip variants not at this location
          }
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
            log.error('check-existing-error', { sku: variant.sku, error: checkError });
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
              // Validate IDs before updating
              if (!product.id.startsWith('gid://shopify/Product/') ||
                  !variant.id.startsWith('gid://shopify/ProductVariant/') ||
                  !variant.inventoryItem.id.startsWith('gid://shopify/InventoryItem/')) {
                log.error('invalid-shopify-id-format', {
                  product_id: product.id,
                  variant_id: variant.id,
                  inventory_item_id: variant.inventoryItem.id
                });
                result.errors++;
                result.items.push({
                  product_id: product.id,
                  title: product.title,
                  sku: variant.sku,
                  status: 'error',
                });
                continue;
              }

              // Update existing item with Shopify IDs
              const { error: updateError } = await supabase
                .from('intake_items')
                .update({
                  shopify_product_id: product.id,
                  shopify_variant_id: variant.id,
                  shopify_inventory_item_id: variant.inventoryItem.id,
                  last_shopify_synced_at: new Date().toISOString(),
                  shopify_sync_status: 'synced',
                  updated_by: 'shopify_import'
                })
                .eq('id', existing.id);

              if (updateError) {
                log.error('update-item-error', { id: existing.id, error: updateError });
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
                log.info('item-linked', { 
                  item_id: existing.id, 
                  sku: variant.sku,
                  product_id: product.id 
                });
              }
            } else {
              // No matching item in database - log for review
              log.info('unmatched-shopify-item', {
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
          log.error('process-variant-error', { 
            sku: variant.sku, 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          result.errors++;
          result.items.push({
            product_id: product.id,
            title: product.title,
            sku: variant.sku,
            status: 'error',
          });
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    log.error('shopify-import-error', { 
      error: errorMessage,
      stack: errorStack,
      type: error?.constructor?.name 
    });
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Check edge function logs for more information'
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});