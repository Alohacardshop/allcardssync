import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SyncRun {
  id: string;
  batch_id: string;
  mode: 'single' | 'bulk';
  store_key: string;
  total_items: number;
  succeeded: number;
  failed: number;
  total_api_calls: number;
  total_duration_ms: number;
  triggered_by: string | null;
  status: string;
  created_at: string;
}

export interface SyncRunItem {
  id: string;
  run_id: string;
  item_id: string;
  sku: string | null;
  title: string | null;
  success: boolean;
  error: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  api_calls: number;
  duration_ms: number;
  created_at: string;
}

export interface SyncDashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  storeKey?: string;
  batchId?: string;
  successOnly?: boolean;
  failedOnly?: boolean;
  blockedOnly?: boolean;
}

export function useSyncRuns(filters: SyncDashboardFilters) {
  return useQuery({
    queryKey: ['shopify-sync-runs', filters],
    queryFn: async () => {
      let query = supabase
        .from('shopify_sync_runs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59Z');
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.storeKey) {
        query = query.eq('store_key', filters.storeKey);
      }
      if (filters.batchId) {
        query = query.eq('batch_id', filters.batchId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SyncRun[];
    },
    refetchInterval: 30000,
  });
}

export function useSyncRunItems(runId: string | null) {
  return useQuery({
    queryKey: ['shopify-sync-run-items', runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from('shopify_sync_run_items' as any)
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as SyncRunItem[];
    },
    enabled: !!runId,
  });
}

export function useSyncSummaryStats(dateFrom: string) {
  return useQuery({
    queryKey: ['shopify-sync-summary', dateFrom],
    queryFn: async () => {
      const { data: runs, error } = await supabase
        .from('shopify_sync_runs' as any)
        .select('*')
        .gte('created_at', dateFrom);

      if (error) throw error;
      const allRuns = (runs || []) as unknown as SyncRun[];

      const totalSynced = allRuns.reduce((s, r) => s + r.succeeded, 0);
      const totalFailed = allRuns.reduce((s, r) => s + r.failed, 0);
      const totalRetrying = allRuns.filter(r => r.status === 'running').length;
      const totalApiCalls = allRuns.reduce((s, r) => s + r.total_api_calls, 0);
      const totalItems = allRuns.reduce((s, r) => s + r.total_items, 0);
      const totalDuration = allRuns.reduce((s, r) => s + r.total_duration_ms, 0);

      // Count blocked items from failed run items
      const failedRunIds = allRuns.filter(r => r.failed > 0).map(r => r.id);
      let totalBlocked = 0;
      if (failedRunIds.length > 0) {
        const { data: failedItems } = await supabase
          .from('shopify_sync_run_items' as any)
          .select('error')
          .in('run_id', failedRunIds)
          .eq('success', false);
        totalBlocked = ((failedItems || []) as any[]).filter(
          (i: any) => i.error?.includes('Duplicate protection')
        ).length;
      }

      return {
        totalSynced,
        totalFailed,
        totalRetrying,
        totalBlocked,
        avgApiCalls: totalItems > 0 ? Math.round(totalApiCalls / totalItems * 10) / 10 : 0,
        avgDuration: totalItems > 0 ? Math.round(totalDuration / totalItems) : 0,
      };
    },
    refetchInterval: 30000,
  });
}

export function useRetryFailedItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ runId }: { runId: string }) => {
      // Get failed items from this run
      const { data: failedItems, error } = await supabase
        .from('shopify_sync_run_items' as any)
        .select('item_id')
        .eq('run_id', runId)
        .eq('success', false);

      if (error) throw error;
      if (!failedItems?.length) throw new Error('No failed items to retry');

      // Get the run to find store/location
      const { data: run } = await supabase
        .from('shopify_sync_runs' as any)
        .select('store_key')
        .eq('id', runId)
        .single();

      const itemIds = (failedItems as any[]).map((i: any) => i.item_id);

      // Call bulk sync for the failed items
      const { data, error: invokeError } = await supabase.functions.invoke('bulk-shopify-sync', {
        body: {
          item_ids: itemIds,
          storeKey: (run as any)?.store_key,
          // locationGid will need to be provided — for now use a placeholder
        }
      });

      if (invokeError) throw invokeError;
      return data;
    },
    onSuccess: () => {
      toast.success('Retry started for failed items');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-runs'] });
    },
    onError: (error: Error) => {
      toast.error(`Retry failed: ${error.message}`);
    },
  });
}

export function useRepairLinkage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      const { data, error } = await supabase.functions.invoke('repair-shopify-linkage', {
        body: { item_id: itemId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Linkage repaired successfully');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-run-items'] });
    },
    onError: (error: Error) => {
      toast.error(`Repair failed: ${error.message}`);
    },
  });
}
