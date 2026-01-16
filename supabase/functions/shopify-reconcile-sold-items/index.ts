import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';
import { fetchWithRetry } from '../_shared/http.ts';
import { log } from '../_lib/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReconcileResult {
  itemId: string;
  sku?: string;
  subject?: string;
  action: 'confirmed_sold' | 'quantity_corrected' | 'cleared_shopify_refs' | 'error';
  details: string;
  before: {
    quantity: number;
    sold_at: string | null;
    shopify_product_id: string | null;
  };
  after: {
    quantity: number;
    sold_at: string | null;
    shopify_sync_status: string;
  };
}

interface ReconcileResponse {
  success: boolean;
  dryRun: boolean;
  processed: number;
  confirmed_sold: number;
  quantity_corrected: number;
  cleared_refs: number;
  errors: number;
  results: ReconcileResult[];
}

async function getShopifyInventoryLevel(
  domain: string,
  accessToken: string,
  inventoryItemId: string,
  locationId: string
): Promise<number | null> {
  const query = `
    query getInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
      inventoryItem(id: $inventoryItemId) {
        id
        inventoryLevel(locationId: $locationId) {
          available
        }
      }
    }
  `;

  try {
    const response = await fetchWithRetry(
      `https://${domain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { inventoryItemId, locationId }
        }),
      },
      { retries: 2, baseDelayMs: 1000 }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Product deleted
      }
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      log.warn('Shopify GraphQL errors', { errors: data.errors });
      return null;
    }

    return data.data?.inventoryItem?.inventoryLevel?.available ?? null;
  } catch (error) {
    log.error('Failed to fetch Shopify inventory', { error: error.message, inventoryItemId });
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { store_key, item_ids, dry_run = false, batch_size = 50 } = await req.json();

    if (!store_key) {
      return new Response(
        JSON.stringify({ error: 'store_key is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log.info('Starting reconciliation', { store_key, dry_run, batch_size, user_id: user.id });

    // Resolve Shopify credentials
    const config = await resolveShopifyConfig(supabaseClient, store_key);
    if (!config.ok) {
      return new Response(
        JSON.stringify({ error: config.message, code: config.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { domain, accessToken } = config.credentials;

    // Fetch items that need reconciliation
    let query = supabaseClient
      .from('intake_items')
      .select('id, sku, subject, quantity, sold_at, sold_price, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_sync_status, shopify_location_gid, shopify_removed_at')
      .eq('store_key', store_key)
      .not('sold_at', 'is', null)
      .is('deleted_at', null);

    // Filter to items with sync issues
    if (!item_ids || item_ids.length === 0) {
      query = query.or('shopify_sync_status.is.null,shopify_sync_status.neq.synced,shopify_removed_at.is.null');
    } else {
      query = query.in('id', item_ids);
    }

    query = query.limit(batch_size);

    const { data: items, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: dry_run,
          processed: 0,
          confirmed_sold: 0,
          quantity_corrected: 0,
          cleared_refs: 0,
          errors: 0,
          results: [],
          message: 'No items need reconciliation'
        } as ReconcileResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: ReconcileResult[] = [];
    let confirmed_sold = 0;
    let quantity_corrected = 0;
    let cleared_refs = 0;
    let errors = 0;

    // Process each item with rate limiting
    for (const item of items) {
      const before = {
        quantity: item.quantity,
        sold_at: item.sold_at,
        shopify_product_id: item.shopify_product_id,
      };

      try {
        // If no Shopify product ID, just mark as synced
        if (!item.shopify_inventory_item_id || !item.shopify_location_gid) {
          if (!dry_run) {
            await supabaseClient
              .from('intake_items')
              .update({
                quantity: 0,
                shopify_sync_status: 'synced',
                shopify_removed_at: item.shopify_removed_at || new Date().toISOString(),
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_inventory_item_id: null,
              })
              .eq('id', item.id);
          }

          results.push({
            itemId: item.id,
            sku: item.sku,
            subject: item.subject,
            action: 'cleared_shopify_refs',
            details: 'No Shopify product ID - cleared references and marked synced',
            before,
            after: {
              quantity: 0,
              sold_at: item.sold_at || new Date().toISOString(),
              shopify_sync_status: 'synced',
            },
          });
          cleared_refs++;
          continue;
        }

        // Query Shopify for actual inventory level
        const shopifyQuantity = await getShopifyInventoryLevel(
          domain,
          accessToken,
          item.shopify_inventory_item_id,
          item.shopify_location_gid
        );

        // Product not found or deleted in Shopify
        if (shopifyQuantity === null) {
          if (!dry_run) {
            await supabaseClient
              .from('intake_items')
              .update({
                quantity: 0,
                shopify_sync_status: 'synced',
                shopify_removed_at: item.shopify_removed_at || new Date().toISOString(),
              })
              .eq('id', item.id);
          }

          results.push({
            itemId: item.id,
            sku: item.sku,
            subject: item.subject,
            action: 'confirmed_sold',
            details: 'Product not found in Shopify (deleted) - confirmed as sold',
            before,
            after: {
              quantity: 0,
              sold_at: item.sold_at,
              shopify_sync_status: 'synced',
            },
          });
          confirmed_sold++;
          continue;
        }

        // Shopify says 0 - confirm sold
        if (shopifyQuantity === 0) {
          if (!dry_run) {
            await supabaseClient
              .from('intake_items')
              .update({
                quantity: 0,
                shopify_sync_status: 'synced',
                shopify_removed_at: item.shopify_removed_at || new Date().toISOString(),
              })
              .eq('id', item.id);
          }

          results.push({
            itemId: item.id,
            sku: item.sku,
            subject: item.subject,
            action: 'confirmed_sold',
            details: 'Shopify inventory = 0 - confirmed as sold',
            before,
            after: {
              quantity: 0,
              sold_at: item.sold_at,
              shopify_sync_status: 'synced',
            },
          });
          confirmed_sold++;
          continue;
        }

        // MISMATCH: Shopify has inventory but we marked it sold
        if (shopifyQuantity > 0) {
          if (!dry_run) {
            await supabaseClient
              .from('intake_items')
              .update({
                quantity: shopifyQuantity,
                sold_at: null, // Clear sold status
                sold_price: null,
                shopify_sync_status: 'synced',
                shopify_removed_at: null,
              })
              .eq('id', item.id);
          }

          results.push({
            itemId: item.id,
            sku: item.sku,
            subject: item.subject,
            action: 'quantity_corrected',
            details: `MISMATCH FIXED: Database had quantity=${item.quantity} and sold_at set, but Shopify has ${shopifyQuantity} in stock. Restored to match Shopify.`,
            before,
            after: {
              quantity: shopifyQuantity,
              sold_at: null,
              shopify_sync_status: 'synced',
            },
          });
          quantity_corrected++;
        }

        // Rate limiting: 2 requests per second
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        log.error('Error reconciling item', { itemId: item.id, error: error.message });
        results.push({
          itemId: item.id,
          sku: item.sku,
          subject: item.subject,
          action: 'error',
          details: `Error: ${error.message}`,
          before,
          after: before,
        });
        errors++;
      }
    }

    const response: ReconcileResponse = {
      success: true,
      dryRun: dry_run,
      processed: items.length,
      confirmed_sold,
      quantity_corrected,
      cleared_refs,
      errors,
      results,
    };

    log.info('Reconciliation complete', {
      store_key,
      dry_run,
      processed: items.length,
      confirmed_sold,
      quantity_corrected,
      cleared_refs,
      errors,
    });

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log.error('Reconciliation failed', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
