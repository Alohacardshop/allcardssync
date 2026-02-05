 // Shopify Inventory Reconciliation
 // Boringly reliable: modes, locks, bulk operations, health tracking
 // 
 // INVENTORY TRUTH CONTRACT:
 // - Shopify is source of truth
 // - We only MIRROR Shopify, never overwrite it
 // - Skip locked items to avoid race conditions
 
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
 import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';
 import { filterLockedSkus, cleanupExpiredLocks } from '../_shared/inventory-lock-helpers.ts';
 import { 
   startBulkOperation, 
   pollBulkOperation, 
   parseBulkResults,
   type InventoryLevelData 
 } from '../_shared/shopify-bulk-operations.ts';
 import { 
   fetchInventoryLevelsPaginated, 
   fetchSpecificInventoryLevels 
 } from '../_shared/shopify-inventory-fetch.ts';
 import {
   type ReconcileMode,
   type ReconcileStats,
   type LocationStats,
   type ReconcileRequest,
   type ReconcileResponse,
   type ReconcileRunResult,
   ReconcileError,
   ReconcileErrorCodes,
 } from '../_shared/reconciliation-types.ts';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 // ============================================================================
 // MODE-SPECIFIC ITEM FETCHERS
 // ============================================================================
 
 async function fetchDriftItemIds(supabaseClient: any, storeKey: string): Promise<string[]> {
   // Get items with drift flag set
   const { data, error } = await supabaseClient
     .from('intake_items')
     .select('shopify_inventory_item_id')
     .eq('store_key', storeKey)
     .is('deleted_at', null)
     .not('shopify_inventory_item_id', 'is', null)
     .eq('shopify_drift', true);
 
   if (error) {
     console.error('[RECONCILE] Failed to fetch drift items:', error);
     return [];
   }
 
   return [...new Set((data || []).map((d: any) => d.shopify_inventory_item_id).filter(Boolean))];
 }
 
 async function fetchMissingItemIds(supabaseClient: any, storeKey: string): Promise<string[]> {
   // Get items that have never been reconciled (no last_shopify_seen_at)
   const { data, error } = await supabaseClient
     .from('intake_items')
     .select('shopify_inventory_item_id')
     .eq('store_key', storeKey)
     .is('deleted_at', null)
     .not('shopify_inventory_item_id', 'is', null)
     .is('last_shopify_seen_at', null);
 
   if (error) {
     console.error('[RECONCILE] Failed to fetch missing items:', error);
     return [];
   }
 
   return [...new Set((data || []).map((d: any) => d.shopify_inventory_item_id).filter(Boolean))];
 }
 
 // ============================================================================
 // RECONCILIATION LOGIC (Read-Only from Shopify)
 // ============================================================================
 
 async function reconcileInventoryLevels(
  supabaseClient: any,
  storeKey: string,
  levels: InventoryLevelData[],
   truthMode: 'shopify' | 'database' = 'shopify',
   dryRun = false
 ): Promise<ReconcileStats> {
   const stats: ReconcileStats = {
    items_checked: 0,
    drift_detected: 0,
    drift_fixed: 0,
    errors: 0,
     skipped_locked: 0,
     levels_fetched: levels.length,
     location_stats: new Map(),
  };

   // Opportunistic cleanup of expired locks
   await cleanupExpiredLocks(supabaseClient).catch(() => {});

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
   const BATCH_SIZE = 100;
   
   for (let i = 0; i < levels.length; i += BATCH_SIZE) {
     const batch = levels.slice(i, i + BATCH_SIZE);
     
     // Always upsert to shopify_inventory_levels (our mirror table)
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

     if (!dryRun) {
       const { error: upsertError } = await supabaseClient
         .from('shopify_inventory_levels')
         .upsert(upsertRows, { onConflict: 'store_key,inventory_item_id,location_gid' });
 
       if (upsertError) {
         console.error('[RECONCILE] Mirror upsert error:', upsertError);
         stats.errors += batch.length;
         continue;
       }
    }

     // Process each level for intake_items reconciliation
     for (const level of batch) {
       // CRITICAL: Skip locked SKUs - they're being modified
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
 
             if (dryRun) {
               if (hasDrift) {
                 stats.drift_detected++;
                 locStats.drift_detected++;
                 console.log(`[RECONCILE][DRY-RUN] Would sync ${item.sku}: ${localQty} → ${shopifyQty}`);
               }
               continue;
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
 
               if (dryRun) {
                 if (hasDrift) stats.drift_detected++;
                 continue;
               }
 
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
 
               if (dryRun) {
                 stats.drift_fixed++;
                 continue;
               }
 
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
     // Parse request body for options
     let mode: ReconcileMode = 'full';
     let targetStoreKey: string | null = null;
     let dryRun = false;
     let maxItems: number | undefined;
     
     try {
       const body = await req.json();
       mode = body.mode || 'full';
       targetStoreKey = body.store_key || null;
       dryRun = body.dry_run === true;
       maxItems = typeof body.max_items === 'number' ? body.max_items : undefined;
     } catch {
       // No body or invalid JSON - use defaults
     }
 
     console.log(`[RECONCILE] Starting: mode=${mode}, store=${targetStoreKey || 'all'}, dry_run=${dryRun}`);
 
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
       throw new ReconcileError(
         `Failed to fetch stores: ${storesError.message}`,
         ReconcileErrorCodes.DATABASE_ERROR
       );
     }
 
     const results: Record<string, ReconcileRunResult> = {};
 
     for (const store of stores || []) {
       const storeKey = store.key;
       const truthMode = (store.inventory_truth_mode || 'shopify') as 'shopify' | 'database';
       let runId: string | null = null;
       const storeStartTime = Date.now();
 
       try {
         // Create run record with detailed metadata
         const runType = mode === 'full' 
           ? 'inventory_reconcile_full' 
           : mode === 'missing_only'
             ? 'inventory_reconcile_missing'
             : 'inventory_reconcile_drift';
             
         const { data: run, error: runError } = await supabaseClient
           .from('sync_health_runs')
           .insert({
             store_key: storeKey,
             run_type: runType,
             status: dryRun ? 'dry_run' : 'running',
             started_at: new Date().toISOString(),
             items_checked: 0,
             drift_detected: 0,
             drift_fixed: 0,
             errors: 0,
             metadata: {
               mode,
               dry_run: dryRun,
               truth_mode: truthMode,
               triggered_by: targetStoreKey ? 'manual' : 'scheduled',
             }
           })
           .select('id')
           .single();
 
         if (runError) {
           console.error('[RECONCILE] Failed to create run record:', runError);
         } else {
           runId = run.id;
         }
 
         // Resolve Shopify credentials
         const config = await resolveShopifyConfig(supabaseClient, storeKey);
         if (!config.ok) {
           throw new ReconcileError(
             config.message,
             ReconcileErrorCodes.CREDENTIALS_MISSING,
             config.diagnostics
           );
         }
 
         const { domain, accessToken } = config.credentials;
         let levels: InventoryLevelData[] = [];
         let fetchMethod = 'none';
 
         // =====================================================================
         // MODE-SPECIFIC FETCHING
         // =====================================================================
         
         if (mode === 'drift_only') {
           // DRIFT-ONLY MODE: Only fetch items flagged as drift
           const driftItemIds = await fetchDriftItemIds(supabaseClient, storeKey);
           console.log(`[${storeKey}] Found ${driftItemIds.length} drift items`);
           
           if (driftItemIds.length > 0) {
             levels = await fetchSpecificInventoryLevels(domain, accessToken, driftItemIds);
             fetchMethod = 'targeted_graphql';
           }
         } else if (mode === 'missing_only') {
           // MISSING-ONLY MODE: Only fetch items never reconciled
           const missingItemIds = await fetchMissingItemIds(supabaseClient, storeKey);
           console.log(`[${storeKey}] Found ${missingItemIds.length} missing items`);
           
           if (missingItemIds.length > 0) {
             levels = await fetchSpecificInventoryLevels(domain, accessToken, missingItemIds);
             fetchMethod = 'targeted_graphql';
           }
         } else {
           // FULL MODE: Use Bulk Operations for complete inventory pull
           console.log(`[${storeKey}] Starting bulk operation for full reconciliation...`);
           
           const bulkOp = await startBulkOperation(domain, accessToken);
           
           if (bulkOp) {
             console.log(`[${storeKey}] Bulk operation started: ${bulkOp.id}`);
             const result = await pollBulkOperation(domain, accessToken, {
               maxWaitMs: 300000, // 5 min timeout
               pollIntervalMs: 3000,
               onProgress: (status, count) => {
                 console.log(`[${storeKey}] Bulk progress: ${status} (${count} objects)`);
               }
             });
             
             if (result?.url) {
               console.log(`[${storeKey}] Bulk complete, parsing ${result.objectCount} objects...`);
               levels = await parseBulkResults(result.url);
               fetchMethod = 'bulk_operation';
             } else {
               console.warn(`[${storeKey}] Bulk failed, falling back to pagination...`);
               levels = await fetchInventoryLevelsPaginated(domain, accessToken, { maxItems });
               fetchMethod = 'paginated_fallback';
             }
           } else {
             console.warn(`[${storeKey}] Could not start bulk op, using pagination...`);
             levels = await fetchInventoryLevelsPaginated(domain, accessToken, { maxItems });
             fetchMethod = 'paginated_fallback';
           }
         }
 
         console.log(`[${storeKey}] Fetched ${levels.length} inventory levels via ${fetchMethod}`);
 
         // =====================================================================
         // RECONCILIATION (Read-only from Shopify, mirrors to DB)
         // =====================================================================
         
         const stats = await reconcileInventoryLevels(
           supabaseClient, 
           storeKey, 
           levels, 
           truthMode,
           dryRun
         );
 
         // Save per-location stats if table exists
         if (runId && stats.location_stats.size > 0 && !dryRun) {
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
             .catch((err: any) => {
               console.warn('[RECONCILE] Failed to save location stats:', err?.message);
             });
         }
 
         // Update run record with comprehensive summary
         const storeDurationMs = Date.now() - storeStartTime;
         if (runId) {
           await supabaseClient
             .from('sync_health_runs')
             .update({
               status: dryRun ? 'dry_run_completed' : 'completed',
               completed_at: new Date().toISOString(),
               items_checked: stats.items_checked,
               drift_detected: stats.drift_detected,
               drift_fixed: stats.drift_fixed,
               errors: stats.errors,
               metadata: {
                 mode,
                 dry_run: dryRun,
                 truth_mode: truthMode,
                 fetch_method: fetchMethod,
                 levels_fetched: levels.length,
                 skipped_locked: stats.skipped_locked,
                 duration_ms: storeDurationMs,
                 locations_processed: stats.location_stats.size,
                 triggered_by: targetStoreKey ? 'manual' : 'scheduled',
                 summary: `Checked ${stats.items_checked}, fixed ${stats.drift_fixed}, detected ${stats.drift_detected}, errors ${stats.errors}, skipped ${stats.skipped_locked} locked`,
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
             skipped_locked: stats.skipped_locked,
             locations_processed: stats.location_stats.size,
           },
           duration_ms: storeDurationMs,
         };
 
       } catch (error: any) {
         console.error(`[RECONCILE] Error for ${storeKey}:`, error);
         
         const errorCode = error instanceof ReconcileError 
           ? error.code 
           : ReconcileErrorCodes.UNKNOWN;
 
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
                 dry_run: dryRun,
                 truth_mode: truthMode,
                 error_code: errorCode,
                 error_details: String(error),
               }
             })
             .eq('id', runId);
         }
 
         results[storeKey] = { 
           success: false, 
           run_id: runId, 
           fetch_method: 'none',
           stats: {
             items_checked: 0,
             drift_detected: 0,
             drift_fixed: 0,
             errors: 1,
             skipped_locked: 0,
             locations_processed: 0,
           },
           error: error.message,
           duration_ms: Date.now() - storeStartTime,
         };
       }
     }
 
     const response: ReconcileResponse = {
       success: true,
       mode,
       dry_run: dryRun,
       duration_ms: Date.now() - startTime,
       stores_processed: stores?.length || 0,
       results,
     };
 
     return new Response(
       JSON.stringify(response),
       { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error: any) {
     console.error('[RECONCILE] Fatal error:', error);
     
     const errorCode = error instanceof ReconcileError 
       ? error.code 
       : ReconcileErrorCodes.UNKNOWN;
     
     return new Response(
       JSON.stringify({ 
         success: false,
         error: error.message,
         error_code: errorCode,
         duration_ms: Date.now() - startTime,
       }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });
