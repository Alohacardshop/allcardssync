import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';
import { fetchWithRetry } from '../_shared/http.ts';
import { filterLockedSkus, cleanupExpiredLocks } from '../_shared/inventory-lock-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// BULK OPERATION APPROACH: Handles unlimited inventory items via async export
// ============================================================================

const BULK_MUTATION = `
  mutation {
    bulkOperationRunQuery(
      query: """
        {
          inventoryItems {
            edges {
              node {
                id
                sku
                inventoryLevels {
                  edges {
                    node {
                      id
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
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
          }
        }
      """
    ) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const BULK_STATUS_QUERY = `
  query {
    currentBulkOperation {
      id
      status
      errorCode
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

interface InventoryLevelData {
  inventory_item_id: string;
  location_gid: string;
  location_name: string;
  available: number;
  shopify_updated_at: string;
  sku: string | null;
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
  skipped_locked: number;
  location_stats: Map<string, LocationStats>;
}

type ReconcileMode = 'full' | 'drift_only';

// ============================================================================
// BULK OPERATION FUNCTIONS
// ============================================================================

async function startBulkOperation(domain: string, accessToken: string): Promise<{ id: string } | null> {
  const response = await fetchWithRetry(
    `https://${domain}/admin/api/2024-07/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: BULK_MUTATION }),
    },
    { retries: 3 }
  );

  const data = await response.json();
  
  if (data.errors || data.data?.bulkOperationRunQuery?.userErrors?.length > 0) {
    const errors = data.errors || data.data?.bulkOperationRunQuery?.userErrors;
    console.error('Bulk operation start error:', errors);
    return null;
  }

  return data.data?.bulkOperationRunQuery?.bulkOperation;
}

async function pollBulkOperation(
  domain: string, 
  accessToken: string, 
  maxWaitMs = 300000 // 5 minutes max
): Promise<{ url: string; objectCount: number } | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
    
    const response = await fetchWithRetry(
      `https://${domain}/admin/api/2024-07/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: BULK_STATUS_QUERY }),
      }
    );

    const data = await response.json();
    const op = data.data?.currentBulkOperation;
    
    if (!op) {
      console.log('No current bulk operation found');
      return null;
    }

    console.log(`Bulk operation status: ${op.status}, objects: ${op.objectCount || 0}`);

    if (op.status === 'COMPLETED') {
      return { url: op.url, objectCount: op.objectCount || 0 };
    }
    
    if (op.status === 'FAILED' || op.status === 'CANCELED') {
      console.error('Bulk operation failed:', op.errorCode);
      return null;
    }
  }

  console.error('Bulk operation timed out');
  return null;
}

async function parseBulkResults(url: string): Promise<InventoryLevelData[]> {
  const levels: InventoryLevelData[] = [];
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bulk results: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.trim().split('\n');

  // JSONL format: each line is a JSON object
  // Parent objects (InventoryItem) have __parentId: null
  // Child objects (InventoryLevel) have __parentId: gid://shopify/InventoryItem/xxx
  
  const inventoryItems = new Map<string, { sku: string | null }>();
  const rawLevels: Array<{
    id: string;
    quantities: Array<{ name: string; quantity: number }>;
    updatedAt: string;
    location: { id: string; name: string };
    __parentId: string;
  }> = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const obj = JSON.parse(line);
      
      // InventoryItem (parent)
      if (obj.id?.includes('InventoryItem') && !obj.__parentId) {
        inventoryItems.set(obj.id, { sku: obj.sku || null });
      }
      
      // InventoryLevel (child)
      if (obj.id?.includes('InventoryLevel') && obj.__parentId) {
        rawLevels.push(obj);
      }
    } catch (e) {
      console.warn('Failed to parse JSONL line:', e);
    }
  }

  // Combine levels with their parent item data
  for (const level of rawLevels) {
    const parentItem = inventoryItems.get(level.__parentId);
    const availableQty = level.quantities?.find(q => q.name === 'available')?.quantity ?? 0;
    
    levels.push({
      inventory_item_id: level.__parentId.replace('gid://shopify/InventoryItem/', ''),
      location_gid: level.location.id,
      location_name: level.location.name,
      available: availableQty,
      shopify_updated_at: level.updatedAt,
      sku: parentItem?.sku || null,
    });
  }

  return levels;
}

// ============================================================================
// FALLBACK: Paginated GraphQL for smaller datasets or bulk operation failures
// ============================================================================

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
                quantities(names: ["available"]) {
                  name
                  quantity
                }
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

async function fetchShopifyInventoryLevelsPaginated(
  domain: string,
  accessToken: string,
  maxItems?: number // Optional limit for drift-only mode
): Promise<InventoryLevelData[]> {
  const levels: InventoryLevelData[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
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
          variables: { first: 50, after: cursor },
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
        const availableQty = level.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0;
        
        levels.push({
          inventory_item_id: inventoryItemId.replace('gid://shopify/InventoryItem/', ''),
          location_gid: level.location.id,
          location_name: level.location.name,
          available: availableQty,
          shopify_updated_at: level.updatedAt,
          sku: item.sku || null,
        });
      }
    }

    hasNextPage = inventoryItems.pageInfo.hasNextPage;
    cursor = inventoryItems.pageInfo.endCursor;

    // Optional early exit for limited reconciliation
    if (maxItems && levels.length >= maxItems) {
      console.log(`Reached max items limit: ${maxItems}`);
      break;
    }

    // Rate limiting - respect Shopify's throttling
    await new Promise(r => setTimeout(r, 200));
  }

  return levels;
}

// ============================================================================
// DRIFT-ONLY MODE: Only reconcile items flagged as drift or missing
// ============================================================================

async function fetchDriftItemIds(supabaseClient: any, storeKey: string): Promise<string[]> {
  // Get items with drift flag or missing last_shopify_seen_at (never reconciled)
  const { data, error } = await supabaseClient
    .from('intake_items')
    .select('shopify_inventory_item_id')
    .eq('store_key', storeKey)
    .is('deleted_at', null)
    .not('shopify_inventory_item_id', 'is', null)
    .or('shopify_drift.eq.true,last_shopify_seen_at.is.null');

  if (error) {
    console.error('Failed to fetch drift items:', error);
    return [];
  }

  return (data || [])
    .map((d: any) => d.shopify_inventory_item_id)
    .filter(Boolean);
}

async function fetchSpecificInventoryLevels(
  domain: string,
  accessToken: string,
  inventoryItemIds: string[]
): Promise<InventoryLevelData[]> {
  const levels: InventoryLevelData[] = [];
  
  // Process in batches of 50 (GraphQL limit)
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
    const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
    const gids = batch.map(id => `gid://shopify/InventoryItem/${id}`);
    
    const query = `
      query getSpecificInventoryLevels($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on InventoryItem {
            id
            sku
            inventoryLevels(first: 50) {
              edges {
                node {
                  id
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
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
      }
    `;

    const response = await fetchWithRetry(
      `https://${domain}/admin/api/2024-07/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables: { ids: gids } }),
      },
      { retries: 3 }
    );

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      continue;
    }

    for (const node of data.data?.nodes || []) {
      if (!node || !node.id) continue;
      
      for (const levelEdge of node.inventoryLevels?.edges || []) {
        const level = levelEdge.node;
        const availableQty = level.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0;
        
        levels.push({
          inventory_item_id: node.id.replace('gid://shopify/InventoryItem/', ''),
          location_gid: level.location.id,
          location_name: level.location.name,
          available: availableQty,
          shopify_updated_at: level.updatedAt,
          sku: node.sku || null,
        });
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  return levels;
}

// ============================================================================
// RECONCILIATION LOGIC
// ============================================================================

async function reconcileInventoryLevels(
  supabaseClient: any,
  storeKey: string,
  levels: InventoryLevelData[],
  truthMode: 'shopify' | 'database' = 'shopify'
): Promise<ReconcileStats> {
  const stats: ReconcileStats = {
    items_checked: 0,
    drift_detected: 0,
    drift_fixed: 0,
    errors: 0,
    skipped_locked: 0,
    location_stats: new Map(),
  };

  // Clean up expired locks opportunistically
  await cleanupExpiredLocks(supabaseClient);

  // Pre-fetch all SKUs that are currently locked
  const allSkus = levels.map(l => l.sku).filter(Boolean) as string[];
  const { lockedSkus } = await filterLockedSkus(supabaseClient, allSkus, storeKey);
  const lockedSkuSet = new Set(lockedSkus);
  
  if (lockedSkuSet.size > 0) {
    console.log(`[RECONCILE] Skipping ${lockedSkuSet.size} locked SKUs`);
  }

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

  // Process in batches to avoid overwhelming the database
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < levels.length; i += BATCH_SIZE) {
    const batch = levels.slice(i, i + BATCH_SIZE);
    
    // Batch upsert to shopify_inventory_levels
    const upsertRows = batch.map(level => ({
      store_key: storeKey,
      inventory_item_id: level.inventory_item_id,
      location_gid: level.location_gid,
      location_name: level.location_name,
      available: level.available,
      shopify_updated_at: level.shopify_updated_at,
      updated_at: now,
      last_reconciled_at: now,
    }));

    const { error: upsertError } = await supabaseClient
      .from('shopify_inventory_levels')
      .upsert(upsertRows, { onConflict: 'store_key,inventory_item_id,location_gid' });

    if (upsertError) {
      console.error('Batch upsert error:', upsertError);
      stats.errors += batch.length;
      continue;
    }

    // Process each level for intake_items reconciliation
    for (const level of batch) {
      // Skip locked SKUs - they're being modified by another operation
      if (level.sku && lockedSkuSet.has(level.sku)) {
        stats.skipped_locked++;
        continue;
      }

      const locStats = getLocationStats(level.location_gid, level.location_name);
      stats.items_checked++;
      locStats.items_checked++;

      try {
        // Find intake_items with matching inventory_item_id AND location
        const { data: items, error: fetchError } = await supabaseClient
          .from('intake_items')
          .select('id, quantity, shopify_drift, shopify_inventory_item_id, shopify_location_gid, sku')
          .eq('shopify_inventory_item_id', level.inventory_item_id)
          .eq('shopify_location_gid', level.location_gid)
          .is('deleted_at', null);

        if (fetchError) {
          console.error('Fetch error:', fetchError);
          stats.errors++;
          locStats.errors++;
          continue;
        }

        // Process each matching item based on truth mode
        for (const item of items || []) {
          const localQty = item.quantity || 0;
          const shopifyQty = level.available;
          const hasDrift = localQty !== shopifyQty;

          if (truthMode === 'shopify') {
            // Shopify is source of truth: update intake_items.quantity
            const updateData: Record<string, any> = {
              quantity: Math.max(0, shopifyQty),
              last_shopify_seen_at: now,
              updated_at: now,
            };

            // Clear drift since we're syncing from Shopify
            if (item.shopify_drift) {
              updateData.shopify_drift = false;
              updateData.shopify_drift_detected_at = null;
              updateData.shopify_drift_details = null;
              stats.drift_fixed++;
              locStats.drift_fixed++;
            }

            // Mark as sold if quantity goes to 0
            if (shopifyQty === 0 && localQty > 0) {
              updateData.sold_at = now;
              updateData.sold_channel = 'shopify_reconcile_sync';
            }

            const { error: updateError } = await supabaseClient
              .from('intake_items')
              .update(updateData)
              .eq('id', item.id);

            if (updateError) {
              stats.errors++;
              locStats.errors++;
            } else if (hasDrift) {
              console.log(`[Reconcile] Synced ${item.sku}: ${localQty} → ${shopifyQty}`);
            }
          } else {
            // Database is source of truth: only flag drift as audit/alert
            if (hasDrift && !item.shopify_drift) {
              const { error: updateError } = await supabaseClient
                .from('intake_items')
                .update({
                  shopify_drift: true,
                  shopify_drift_detected_at: now,
                  shopify_drift_details: {
                    expected: localQty,
                    actual: shopifyQty,
                    location_gid: level.location_gid,
                    location_name: level.location_name,
                    detected_by: 'reconcile_job',
                    detected_at: now,
                    mode: 'database_truth'
                  },
                  last_shopify_seen_at: now,
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
                  last_shopify_seen_at: now,
                })
                .eq('id', item.id);

              if (!clearError) {
                stats.drift_fixed++;
                locStats.drift_fixed++;
              } else {
                stats.errors++;
                locStats.errors++;
              }
            } else {
              // Just update last_shopify_seen_at
              await supabaseClient
                .from('intake_items')
                .update({ last_shopify_seen_at: now })
                .eq('id', item.id);
            }
          }
        }
      } catch (error) {
        console.error('Error processing level:', error);
        stats.errors++;
        locStats.errors++;
      }
    }
  }

  return stats;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse request body for mode selection
    let mode: ReconcileMode = 'full';
    let targetStoreKey: string | null = null;
    
    try {
      const body = await req.json();
      mode = body.mode || 'full';
      targetStoreKey = body.store_key || null;
    } catch {
      // No body or invalid JSON - use defaults
    }

    console.log(`Starting reconciliation: mode=${mode}, store=${targetStoreKey || 'all'}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get active stores to reconcile with their truth mode
    let storesQuery = supabaseClient
      .from('shopify_stores')
      .select('key, name, inventory_truth_mode')
      .eq('active', true);
    
    if (targetStoreKey) {
      storesQuery = storesQuery.eq('key', targetStoreKey);
    }

    const { data: stores, error: storesError } = await storesQuery;

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`);
    }

    const results: Record<string, any> = {};

    for (const store of stores || []) {
      const storeKey = store.key;
      const truthMode = (store.inventory_truth_mode || 'shopify') as 'shopify' | 'database';
      let runId: string | null = null;

      try {
        // Create run record with detailed metadata
        const { data: run, error: runError } = await supabaseClient
          .from('sync_health_runs')
          .insert({
            store_key: storeKey,
            run_type: mode === 'full' ? 'inventory_reconcile_full' : 'inventory_reconcile_drift',
            status: 'running',
            started_at: new Date().toISOString(),
            items_checked: 0,
            drift_detected: 0,
            drift_fixed: 0,
            errors: 0,
            metadata: {
              mode,
              truth_mode: truthMode,
              triggered_by: targetStoreKey ? 'manual' : 'scheduled',
            }
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
        let levels: InventoryLevelData[] = [];
        let fetchMethod = 'unknown';

        if (mode === 'drift_only') {
          // DRIFT-ONLY MODE: Only fetch items flagged as drift or never reconciled
          const driftItemIds = await fetchDriftItemIds(supabaseClient, storeKey);
          console.log(`[${storeKey}] Found ${driftItemIds.length} drift/missing items`);
          
          if (driftItemIds.length > 0) {
            levels = await fetchSpecificInventoryLevels(domain, accessToken, driftItemIds);
            fetchMethod = 'targeted_graphql';
          }
        } else {
          // FULL MODE: Use Bulk Operations for complete inventory pull
          console.log(`[${storeKey}] Starting bulk operation for full reconciliation...`);
          
          const bulkOp = await startBulkOperation(domain, accessToken);
          
          if (bulkOp) {
            console.log(`[${storeKey}] Bulk operation started: ${bulkOp.id}`);
            const result = await pollBulkOperation(domain, accessToken);
            
            if (result?.url) {
              console.log(`[${storeKey}] Bulk operation complete, parsing ${result.objectCount} objects...`);
              levels = await parseBulkResults(result.url);
              fetchMethod = 'bulk_operation';
            } else {
              console.warn(`[${storeKey}] Bulk operation failed, falling back to pagination...`);
              levels = await fetchShopifyInventoryLevelsPaginated(domain, accessToken);
              fetchMethod = 'paginated_fallback';
            }
          } else {
            console.warn(`[${storeKey}] Could not start bulk operation, using pagination...`);
            levels = await fetchShopifyInventoryLevelsPaginated(domain, accessToken);
            fetchMethod = 'paginated_fallback';
          }
        }

        console.log(`[${storeKey}] Fetched ${levels.length} inventory levels via ${fetchMethod}`);

        // Reconcile with database using store's truth mode
        const stats = await reconcileInventoryLevels(supabaseClient, storeKey, levels, truthMode);

        // Save per-location stats if table exists
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

          await supabaseClient
            .from('reconciliation_location_stats')
            .insert(locationStatsRows)
            .then(({ error }: any) => {
              if (error) console.warn('Failed to save location stats (table may not exist):', error.message);
            });
        }

        // Update run record with comprehensive summary
        const durationMs = Date.now() - startTime;
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
                mode,
                truth_mode: truthMode,
                fetch_method: fetchMethod,
                levels_fetched: levels.length,
                duration_ms: durationMs,
                locations_processed: stats.location_stats.size,
                triggered_by: targetStoreKey ? 'manual' : 'scheduled',
                summary: `Checked ${stats.items_checked} items, fixed ${stats.drift_fixed} drift, detected ${stats.drift_detected} new drift, ${stats.errors} errors`,
              }
            })
            .eq('id', runId);
        }

        results[storeKey] = {
          success: true,
          run_id: runId,
          fetch_method: fetchMethod,
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
              metadata: {
                mode,
                truth_mode: truthMode,
                error_details: String(error),
              }
            })
            .eq('id', runId);
        }

        results[storeKey] = { success: false, run_id: runId, error: error.message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
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
