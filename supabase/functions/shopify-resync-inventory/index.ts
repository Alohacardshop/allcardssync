import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { 
  acquireInventoryLocks, 
  releaseInventoryLocksByBatch,
  filterLockedSkus 
} from '../_shared/inventory-lock-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { store_key, item_ids, location_gid } = await req.json();

    if (!store_key) {
      return new Response(JSON.stringify({ error: 'store_key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`shopify-resync-inventory: Starting resync for store ${store_key}`, {
      item_ids_count: item_ids?.length || 'all',
      location_gid
    });

    // Get Shopify credentials
    const storeUpper = store_key.toUpperCase();
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single();
    
    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single();
    
    const domain = domainSetting?.key_value;
    const token = tokenSetting?.key_value;

    if (!domain || !token) {
      return new Response(JSON.stringify({ 
        error: `Shopify credentials not configured for store: ${store_key}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch items to resync
    let query = supabase
      .from('intake_items')
      .select('id, sku, subject, quantity, sold_at, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_location_gid')
      .eq('store_key', store_key)
      .not('shopify_product_id', 'is', null);

    if (item_ids && item_ids.length > 0) {
      query = query.in('id', item_ids);
    }

    if (location_gid) {
      query = query.eq('shopify_location_gid', location_gid);
    }

    const { data: items, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch items: ${fetchError.message}`);
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        results: {
          total_checked: 0,
          updated: 0,
          unchanged: 0,
          not_found: 0,
          errors: 0
        },
        details: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`shopify-resync-inventory: Found ${items.length} items to check`);

    // Get SKUs and check which are locked
    const allSkus = items.map(i => i.sku).filter(Boolean) as string[];
    const { lockedSkus } = await filterLockedSkus(supabase, allSkus, store_key);
    const lockedSkuSet = new Set(lockedSkus);
    
    if (lockedSkuSet.size > 0) {
      console.log(`shopify-resync-inventory: Skipping ${lockedSkuSet.size} locked SKUs`);
    }
    
    // Filter out locked items
    const unlockItems = items.filter(item => !item.sku || !lockedSkuSet.has(item.sku));
    
    if (unlockItems.length === 0 && lockedSkuSet.size > 0) {
      return new Response(JSON.stringify({ 
        success: true,
        results: {
          total_checked: 0,
          updated: 0,
          unchanged: 0,
          not_found: 0,
          errors: 0,
          skipped_locked: lockedSkuSet.size
        },
        details: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process items in batches of 50
    const BATCH_SIZE = 50;
    const results = {
      total_checked: 0,
      updated: 0,
      unchanged: 0,
      not_found: 0,
      errors: 0,
      skipped_locked: lockedSkuSet.size
    };
    const details: any[] = [];

    for (let i = 0; i < unlockItems.length; i += BATCH_SIZE) {
      const batch = unlockItems.slice(i, i + BATCH_SIZE);
      
      for (const item of batch) {
        results.total_checked++;

        try {
          // Query Shopify for current inventory level
          const productId = item.shopify_product_id;
          const variantId = item.shopify_variant_id;
          
          if (!variantId) {
            details.push({
              item_id: item.id,
              sku: item.sku,
              status: 'error',
              error: 'Missing variant ID'
            });
            results.errors++;
            continue;
          }

          // GraphQL query to get inventory level
          const graphqlQuery = `
            query GetInventoryLevel($variantId: ID!, $locationId: ID!) {
              productVariant(id: $variantId) {
                id
                inventoryItem {
                  id
                  inventoryLevel(locationId: $locationId) {
                    available
                  }
                }
              }
            }
          `;

          const shopifyLocationId = item.shopify_location_gid || location_gid;
          if (!shopifyLocationId) {
            details.push({
              item_id: item.id,
              sku: item.sku,
              status: 'error',
              error: 'Missing location GID'
            });
            results.errors++;
            continue;
          }

          const response = await fetch(
            `https://${domain}/admin/api/2024-07/graphql.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: graphqlQuery,
                variables: {
                  variantId: `gid://shopify/ProductVariant/${variantId}`,
                  locationId: shopifyLocationId
                }
              }),
            }
          );

          if (response.status === 429) {
            // Rate limited - wait and retry
            await new Promise(r => setTimeout(r, 2000));
            i -= BATCH_SIZE; // Retry this batch
            break;
          }

          if (!response.ok) {
            throw new Error(`Shopify API error: ${response.status}`);
          }

          const result = await response.json();

          if (result.errors) {
            throw new Error(JSON.stringify(result.errors));
          }

          const shopifyQuantity = result.data?.productVariant?.inventoryItem?.inventoryLevel?.available;

          if (shopifyQuantity === undefined || shopifyQuantity === null) {
            // Product not found or deleted in Shopify
            const updateData: any = {
              quantity: 0,
              shopify_removed_at: new Date().toISOString(),
              last_shopify_synced_at: new Date().toISOString()
            };

            if (!item.sold_at) {
              updateData.sold_at = new Date().toISOString();
            }

            await supabase
              .from('intake_items')
              .update(updateData)
              .eq('id', item.id);

            details.push({
              item_id: item.id,
              sku: item.sku,
              subject: item.subject,
              old_qty: item.quantity,
              new_qty: 0,
              status: 'not_found'
            });
            results.not_found++;
            continue;
          }

          // Compare quantities
          if (shopifyQuantity !== item.quantity) {
            const updateData: any = {
              quantity: shopifyQuantity,
              shopify_sync_status: 'synced',
              last_shopify_synced_at: new Date().toISOString(),
              updated_by: 'shopify_resync'
            };

            // Update sold_at status based on quantity
            if (shopifyQuantity === 0 && !item.sold_at) {
              updateData.sold_at = new Date().toISOString();
            } else if (shopifyQuantity > 0 && item.sold_at) {
              updateData.sold_at = null;
            }

            await supabase
              .from('intake_items')
              .update(updateData)
              .eq('id', item.id);

            details.push({
              item_id: item.id,
              sku: item.sku,
              subject: item.subject,
              old_qty: item.quantity,
              new_qty: shopifyQuantity,
              status: 'updated'
            });
            results.updated++;
          } else {
            // Quantity matches, just update sync timestamp
            await supabase
              .from('intake_items')
              .update({
                last_shopify_synced_at: new Date().toISOString(),
                shopify_sync_status: 'synced'
              })
              .eq('id', item.id);

            details.push({
              item_id: item.id,
              sku: item.sku,
              status: 'unchanged'
            });
            results.unchanged++;
          }

        } catch (error) {
          console.error(`Error processing item ${item.id}:`, error);
          details.push({
            item_id: item.id,
            sku: item.sku,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
          results.errors++;
        }

        // Rate limiting: 2 requests per second
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`shopify-resync-inventory: Complete`, results);

    return new Response(JSON.stringify({
      success: true,
      results,
      details
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('shopify-resync-inventory error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
