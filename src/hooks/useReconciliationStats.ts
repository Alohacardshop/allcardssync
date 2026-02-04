import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReconciliationRun {
  id: string;
  store_key: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  items_checked: number;
  drift_detected: number;
  drift_fixed: number;
  errors: number;
  error_message: string | null;
  metadata: Record<string, any> | null;
}

export interface LocationStats {
  id: string;
  run_id: string;
  store_key: string;
  location_gid: string;
  location_name: string | null;
  items_checked: number;
  drift_detected: number;
  drift_fixed: number;
  errors: number;
  created_at: string;
}

export interface StoreReconciliationSummary {
  store_key: string;
  last_run_at: string | null;
  last_status: string | null;
  total_drift: number;
  total_errors: number;
  locations: LocationSummary[];
}

export interface LocationSummary {
  location_gid: string;
  location_name: string | null;
  last_checked_at: string | null;
  current_drift_count: number;
  last_items_checked: number;
}

export function useReconciliationRuns(limit = 20) {
  return useQuery({
    queryKey: ['reconciliation-runs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_health_runs')
        .select('*')
        .eq('run_type', 'inventory_reconcile')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as ReconciliationRun[];
    },
    refetchInterval: 30000,
  });
}

export function useLocationStats(runId?: string) {
  return useQuery({
    queryKey: ['reconciliation-location-stats', runId],
    queryFn: async () => {
      let query = supabase
        .from('reconciliation_location_stats')
        .select('*')
        .order('created_at', { ascending: false });

      if (runId) {
        query = query.eq('run_id', runId);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return data as LocationStats[];
    },
    enabled: true,
    refetchInterval: 30000,
  });
}

export function useStoreReconciliationSummary() {
  return useQuery({
    queryKey: ['store-reconciliation-summary'],
    queryFn: async () => {
      // Get latest run per store
      const { data: runs, error: runsError } = await supabase
        .from('sync_health_runs')
        .select('*')
        .eq('run_type', 'inventory_reconcile')
        .order('started_at', { ascending: false })
        .limit(50);

      if (runsError) throw runsError;

      // Get current drift counts per store/location
      const { data: driftItems, error: driftError } = await supabase
        .from('intake_items')
        .select('store_key, shopify_location_gid')
        .eq('shopify_drift', true)
        .is('deleted_at', null);

      if (driftError) throw driftError;

      // Get latest location stats
      const { data: locationStats, error: statsError } = await supabase
        .from('reconciliation_location_stats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statsError) throw statsError;

      // Aggregate by store
      const storeMap = new Map<string, StoreReconciliationSummary>();

      // Process runs (most recent first)
      for (const run of runs || []) {
        if (!storeMap.has(run.store_key)) {
          storeMap.set(run.store_key, {
            store_key: run.store_key,
            last_run_at: run.completed_at || run.started_at,
            last_status: run.status,
            total_drift: 0,
            total_errors: run.errors || 0,
            locations: [],
          });
        }
      }

      // Count current drift per store/location
      const driftCounts = new Map<string, number>();
      for (const item of driftItems || []) {
        const key = `${item.store_key}_${item.shopify_location_gid}`;
        driftCounts.set(key, (driftCounts.get(key) || 0) + 1);
        
        const store = storeMap.get(item.store_key || 'unknown');
        if (store) {
          store.total_drift++;
        }
      }

      // Add location summaries from latest stats
      const processedLocations = new Set<string>();
      for (const stat of locationStats || []) {
        const key = `${stat.store_key}_${stat.location_gid}`;
        if (processedLocations.has(key)) continue;
        processedLocations.add(key);

        const store = storeMap.get(stat.store_key);
        if (store) {
          store.locations.push({
            location_gid: stat.location_gid,
            location_name: stat.location_name,
            last_checked_at: stat.created_at,
            current_drift_count: driftCounts.get(key) || 0,
            last_items_checked: stat.items_checked,
          });
        }
      }

      return Array.from(storeMap.values());
    },
    refetchInterval: 30000,
  });
}
