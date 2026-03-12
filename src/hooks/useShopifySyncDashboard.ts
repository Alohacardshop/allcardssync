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

export interface SyncJob {
  id: string;
  batch_id: string;
  store_key: string;
  location_gid: string;
  vendor: string | null;
  status: string;
  total_items: number;
  processed_items: number;
  succeeded: number;
  failed: number;
  total_api_calls: number;
  total_duration_ms: number;
  triggered_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SyncJobItem {
  id: string;
  job_id: string;
  item_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  failure_code: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  api_calls: number;
  duration_ms: number;
  created_at: string;
  updated_at: string;
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

// ── Sync Runs (history) ──

export function useSyncRuns(filters: SyncDashboardFilters) {
  return useQuery({
    queryKey: ['shopify-sync-runs', filters],
    queryFn: async () => {
      let query = supabase
        .from('shopify_sync_runs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59Z');
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.storeKey) query = query.eq('store_key', filters.storeKey);
      if (filters.batchId) query = query.eq('batch_id', filters.batchId);

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

      // Count queued jobs
      const { data: queuedJobs } = await supabase
        .from('shopify_sync_job_queue' as any)
        .select('id')
        .in('status', ['queued', 'running']);
      const totalQueued = (queuedJobs || []).length;

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
        totalQueued,
        avgApiCalls: totalItems > 0 ? Math.round(totalApiCalls / totalItems * 10) / 10 : 0,
        avgDuration: totalItems > 0 ? Math.round(totalDuration / totalItems) : 0,
      };
    },
    refetchInterval: 15000,
  });
}

// ── Sync Jobs (queue) ──

export function useSyncJobs() {
  return useQuery({
    queryKey: ['shopify-sync-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_job_queue' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as SyncJob[];
    },
    refetchInterval: 5000, // Fast refresh for active jobs
  });
}

export function useSyncJobItems(jobId: string | null) {
  return useQuery({
    queryKey: ['shopify-sync-job-items', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('shopify_sync_job_items' as any)
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as SyncJobItem[];
    },
    enabled: !!jobId,
    refetchInterval: 5000,
  });
}

// ── Mutations ──

export function useRetryFailedItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ runId }: { runId: string }) => {
      const { data: failedItems, error } = await supabase
        .from('shopify_sync_run_items' as any)
        .select('item_id')
        .eq('run_id', runId)
        .eq('success', false);

      if (error) throw error;
      if (!failedItems?.length) throw new Error('No failed items to retry');

      const { data: run } = await supabase
        .from('shopify_sync_runs' as any)
        .select('store_key')
        .eq('id', runId)
        .single();

      const itemIds = (failedItems as any[]).map((i: any) => i.item_id);

      const { data, error: invokeError } = await supabase.functions.invoke('bulk-shopify-sync', {
        body: { item_ids: itemIds, storeKey: (run as any)?.store_key }
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

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // Cancel by updating status - items still queued won't be processed
      const { error } = await supabase
        .from('shopify_sync_job_queue' as any)
        .update({ status: 'cancelled', completed_at: new Date().toISOString() } as any)
        .eq('id', jobId)
        .in('status', ['queued', 'running']);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Job cancelled');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-jobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Cancel failed: ${error.message}`);
    },
  });
}

export function useResumeJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      // Reset job status to queued so worker can pick it up
      await supabase
        .from('shopify_sync_job_queue' as any)
        .update({ status: 'queued' } as any)
        .eq('id', jobId);

      // Trigger the worker
      const { error } = await supabase.functions.invoke('process-shopify-sync-queue', {
        body: { job_id: jobId }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Job resumed');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-jobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Resume failed: ${error.message}`);
    },
  });
}

export function useRetryFailedJobItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      // Reset failed/blocked items back to queued
      await supabase
        .from('shopify_sync_job_items' as any)
        .update({ status: 'queued', last_error: null, failure_code: null } as any)
        .eq('job_id', jobId)
        .in('status', ['failed', 'blocked']);

      // Reset job status
      await supabase
        .from('shopify_sync_job_queue' as any)
        .update({ status: 'queued' } as any)
        .eq('id', jobId);

      // Trigger worker
      const { error } = await supabase.functions.invoke('process-shopify-sync-queue', {
        body: { job_id: jobId }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Retrying failed items');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-jobs'] });
    },
    onError: (error: Error) => {
      toast.error(`Retry failed: ${error.message}`);
    },
  });
}
