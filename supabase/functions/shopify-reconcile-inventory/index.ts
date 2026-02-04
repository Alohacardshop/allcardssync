import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';
import { fetchWithRetry } from '../_shared/http.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GraphQL query to fetch inventory levels for all locations
const INVENTORY_LEVELS_QUERY = `
  query getInventoryLevels($first: Int!, $after: String) {
    inventoryItems(first: $first, after: $after) {
      edges {
        node {
          id
          sku
          inventoryLevels(first: 50) {
            edges {
              node {
                id
                available
                updatedAt
                location {
                  id
                  name
                }
              }
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

interface InventoryLevelData {
  inventory_item_id: string;
  location_gid: string;
  location_name: string;
  available: number;
  shopify_updated_at: string;
}

interface LocationStats {
  location_gid: string;
  location_name: string;
  items_checked: number;
  drift_detected: number;
  drift_fixed: number;
  errors: number;
}

interface ReconcileStats {
  items_checked: number;
  drift_detected: number;
  drift_fixed: number;
  errors: number;
  location_stats: Map<string, LocationStats>;
}

async function fetchShopifyInventoryLevels(
  domain: string,
  accessToken: string
): Promise<InventoryLevelData[]> {
  const levels: InventoryLevelData[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 100; // Higher limit for full reconciliation

  while (hasNextPage && pageCount < maxPages) {
    const response = await fetchWithRetry(
      `https://${domain}/admin/api/2024-07/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: INVENTORY_LEVELS_QUERY,
          variables: {
            first: 50,
            after: cursor,
          }
        }),
      },
      { retries: 3, baseDelayMs: 1000 }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const inventoryItems = data.data?.inventoryItems;
    if (!inventoryItems) break;

    for (const edge of inventoryItems.edges) {
      const item = edge.node;
      const inventoryItemId = item.id;

      for (const levelEdge of item.inventoryLevels.edges) {
        const level = levelEdge.node;
        levels.push({
          inventory_item_id: inventoryItemId.replace('gid://shopify/InventoryItem/', ''),
          location_gid: level.location.id,
          location_name: level.location.name,
          available: level.available ?? 0,
          shopify_updated_at: level.updatedAt,
        });
      }
    }

    hasNextPage = inventoryItems.pageInfo.hasNextPage;
    cursor = inventoryItems.pageInfo.endCursor;
    pageCount++;

    // Rate limiting - respect Shopify's throttling
    await new Promise(r => setTimeout(r, 200));
  }

  return levels;
}

async function reconcileInventoryLevels(
  supabaseClient: any,
  storeKey: string,
  levels: InventoryLevelData[]
): Promise<ReconcileStats> {
  const stats: ReconcileStats = {
    items_checked: 0,
    drift_detected: 0,
    drift_fixed: 0,
    errors: 0,
    location_stats: new Map(),
  };

  const getLocationStats = (gid: string, name: string): LocationStats => {
    if (!stats.location_stats.has(gid)) {
      stats.location_stats.set(gid, {
        location_gid: gid,
        location_name: name,
        items_checked: 0,
        drift_detected: 0,
        drift_fixed: 0,
        errors: 0,
      });
    }
    return stats.location_stats.get(gid)!;
  };

  const now = new Date().toISOString();

  // Batch upsert all levels into shopify_inventory_levels
  for (const level of levels) {
    const locStats = getLocationStats(level.location_gid, level.location_name);
    
    try {
      const { error: upsertError } = await supabaseClient
        .from('shopify_inventory_levels')
        .upsert({
          store_key: storeKey,
          inventory_item_id: level.inventory_item_id,
          location_gid: level.location_gid,
          location_name: level.location_name,
          available: level.available,
          shopify_updated_at: level.shopify_updated_at,
          updated_at: now,
          last_reconciled_at: now,
        }, {
          onConflict: 'store_key,inventory_item_id,location_gid'
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        stats.errors++;
        locStats.errors++;
        continue;
      }

      stats.items_checked++;
      locStats.items_checked++;

      // Check for drift: find intake_items with this inventory_item_id
      const { data: items, error: fetchError } = await supabaseClient
        .from('intake_items')
        .select('id, quantity, shopify_drift, shopify_inventory_item_id, shopify_location_gid')
        .eq('shopify_inventory_item_id', level.inventory_item_id)
        .is('deleted_at', null);

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        stats.errors++;
        locStats.errors++;
        continue;
      }

      // Check each matching item for drift
      for (const item of items || []) {
        // Only compare if this is the item's assigned location
        if (item.shopify_location_gid !== level.location_gid) continue;

        const expectedQuantity = item.quantity;
        const actualQuantity = level.available;
        const hasDrift = expectedQuantity !== actualQuantity;

        if (hasDrift && !item.shopify_drift) {
          // Mark as drift
          const { error: updateError } = await supabaseClient
            .from('intake_items')
            .update({
              shopify_drift: true,
              shopify_drift_detected_at: now,
              shopify_drift_details: {
                expected: expectedQuantity,
                actual: actualQuantity,
                location_gid: level.location_gid,
                location_name: level.location_name,
                detected_by: 'reconcile_job',
                detected_at: now,
              }
            })
            .eq('id', item.id);

          if (!updateError) {
            stats.drift_detected++;
            locStats.drift_detected++;
          } else {
            stats.errors++;
            locStats.errors++;
          }
        } else if (!hasDrift && item.shopify_drift) {
          // Clear drift flag if now in sync
          const { error: clearError } = await supabaseClient
            .from('intake_items')
            .update({
              shopify_drift: false,
              shopify_drift_detected_at: null,
              shopify_drift_details: null,
            })
            .eq('id', item.id);

          if (!clearError) {
            stats.drift_fixed++;
            locStats.drift_fixed++;
          } else {
            stats.errors++;
            locStats.errors++;
          }
        }
      }
    } catch (error) {
      console.error('Error processing level:', error);
      stats.errors++;
      locStats.errors++;
    }
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Use service role for cron jobs
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get active stores to reconcile
    const { data: stores, error: storesError } = await supabaseClient
      .from('shopify_stores')
      .select('key, name')
      .eq('active', true);

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`);
    }

    const results: Record<string, any> = {};

    for (const store of stores || []) {
      const storeKey = store.key;
      let runId: string | null = null;

      try {
        // Create run record
        const { data: run, error: runError } = await supabaseClient
          .from('sync_health_runs')
          .insert({
            store_key: storeKey,
            run_type: 'inventory_reconcile',
            status: 'running',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (runError) {
          console.error('Failed to create run record:', runError);
        } else {
          runId = run.id;
        }

        // Resolve Shopify credentials
        const config = await resolveShopifyConfig(supabaseClient, storeKey);
        if (!config.ok) {
          throw new Error(config.message);
        }

        const { domain, accessToken } = config.credentials;

        // Fetch all inventory levels from Shopify
        console.log(`[${storeKey}] Fetching inventory levels...`);
        const levels = await fetchShopifyInventoryLevels(domain, accessToken);
        console.log(`[${storeKey}] Fetched ${levels.length} inventory levels`);

        // Reconcile with database
        const stats = await reconcileInventoryLevels(supabaseClient, storeKey, levels);

        // Save per-location stats
        if (runId && stats.location_stats.size > 0) {
          const locationStatsRows = Array.from(stats.location_stats.values()).map(ls => ({
            run_id: runId,
            store_key: storeKey,
            location_gid: ls.location_gid,
            location_name: ls.location_name,
            items_checked: ls.items_checked,
            drift_detected: ls.drift_detected,
            drift_fixed: ls.drift_fixed,
            errors: ls.errors,
          }));

          const { error: statsError } = await supabaseClient
            .from('reconciliation_location_stats')
            .insert(locationStatsRows);

          if (statsError) {
            console.error('Failed to save location stats:', statsError);
          }
        }

        // Update run record
        if (runId) {
          await supabaseClient
            .from('sync_health_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              items_checked: stats.items_checked,
              drift_detected: stats.drift_detected,
              drift_fixed: stats.drift_fixed,
              errors: stats.errors,
              metadata: { 
                levels_fetched: levels.length, 
                duration_ms: Date.now() - startTime,
                locations_processed: stats.location_stats.size,
              }
            })
            .eq('id', runId);
        }

        results[storeKey] = { 
          success: true, 
          stats: {
            items_checked: stats.items_checked,
            drift_detected: stats.drift_detected,
            drift_fixed: stats.drift_fixed,
            errors: stats.errors,
            locations_processed: stats.location_stats.size,
          }
        };

      } catch (error) {
        console.error(`Error reconciling ${storeKey}:`, error);

        // Update run record with error
        if (runId) {
          await supabaseClient
            .from('sync_health_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: error.message,
            })
            .eq('id', runId);
        }

        results[storeKey] = { success: false, error: error.message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: Date.now() - startTime,
        stores_processed: stores?.length || 0,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reconciliation failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
