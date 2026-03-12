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
  heartbeat_at?: string | null;
  lease_expires_at?: string | null;
  claimed_by?: string | null;
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
  queueStatus?: string;
  failureCode?: string;
}

export type FailureCode = 'duplicate' | 'validation_error' | 'rate_limited' | 'shopify_api_error' | 'network_error' | 'missing_inventory_data' | 'blocked_business_rule' | 'unknown_error';

export const FAILURE_CODE_LABELS: Record<string, string> = {
  duplicate: 'Duplicate',
  validation_error: 'Validation',
  rate_limited: 'Rate Limited',
  shopify_api_error: 'API Error',
  network_error: 'Network',
  missing_inventory_data: 'Missing Data',
  blocked_business_rule: 'Blocked',
  unknown_error: 'Unknown',
};

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

export function useSyncJobs(filters?: SyncDashboardFilters) {
  return useQuery({
    queryKey: ['shopify-sync-jobs', filters],
    queryFn: async () => {
      let query = supabase
        .from('shopify_sync_job_queue' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filters?.queueStatus) query = query.eq('status', filters.queueStatus);
      if (filters?.storeKey) query = query.eq('store_key', filters.storeKey);
      if (filters?.batchId) query = query.eq('batch_id', filters.batchId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SyncJob[];
    },
    refetchInterval: 5000,
  });
}

// ── Queue Status Counts ──

export function useQueueStatusCounts() {
  return useQuery({
    queryKey: ['shopify-queue-status-counts'],
    queryFn: async () => {
      // Only fetch items from active (non-terminal) jobs to avoid scanning the entire table
      const { data: activeJobs, error: jobsErr } = await supabase
        .from('shopify_sync_job_queue' as any)
        .select('id')
        .in('status', ['queued', 'running']);

      if (jobsErr) throw jobsErr;
      const activeJobIds = (activeJobs || []).map((j: any) => j.id);

      if (activeJobIds.length === 0) {
        return {
          counts: { queued: 0, running: 0, succeeded: 0, failed: 0, blocked: 0 },
          failureBreakdown: {},
        };
      }

      const { data, error } = await supabase
        .from('shopify_sync_job_items' as any)
        .select('status, failure_code')
        .in('job_id', activeJobIds);
      if (error) throw error;

      const items = (data || []) as any[];
      const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, blocked: 0 };
      const failureBreakdown: Record<string, number> = {};

      items.forEach((item: any) => {
        const s = item.status as string;
        if (s in counts) counts[s as keyof typeof counts]++;
        if (item.failure_code) {
          failureBreakdown[item.failure_code] = (failureBreakdown[item.failure_code] || 0) + 1;
        }
      });

      return { counts, failureBreakdown };
    },
    refetchInterval: 5000,
  });
}

// ── Job Health Metrics ──

export function useJobHealthMetrics() {
  return useQuery({
    queryKey: ['shopify-job-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_job_queue' as any)
        .select('id, status, created_at, heartbeat_at, lease_expires_at, claimed_by')
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: true });
      if (error) throw error;

      const activeJobs = (data || []) as any[];
      const now = Date.now();

      let oldestJobAge: number | null = null;
      const staleJobs: Array<{ id: string; lastHeartbeat: string; ageSec: number }> = [];

      activeJobs.forEach((job: any) => {
        const createdMs = new Date(job.created_at).getTime();
        const ageMs = now - createdMs;
        if (oldestJobAge === null || ageMs > oldestJobAge) oldestJobAge = ageMs;

        if (job.status === 'running' && job.heartbeat_at) {
          const hbAge = now - new Date(job.heartbeat_at).getTime();
          if (hbAge > 120_000) { // stale if >2min since heartbeat
            staleJobs.push({ id: job.id, lastHeartbeat: job.heartbeat_at, ageSec: Math.round(hbAge / 1000) });
          }
        }
      });

      return {
        activeCount: activeJobs.length,
        oldestJobAgeMs: oldestJobAge,
        staleJobs,
      };
    },
    refetchInterval: 10000,
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
      // Fetch failed items from the historical run
      const { data: failedItems, error } = await supabase
        .from('shopify_sync_run_items' as any)
        .select('item_id')
        .eq('run_id', runId)
        .eq('success', false);

      if (error) throw error;
      if (!failedItems?.length) throw new Error('No failed items to retry');

      // Fetch run context (store_key) for the retry job
      const { data: run } = await supabase
        .from('shopify_sync_runs' as any)
        .select('store_key, batch_id')
        .eq('id', runId)
        .single();

      if (!run) throw new Error('Could not find sync run');
      const runData = run as any;

      // Look up the original job to get location_gid and vendor
      const { data: originalJob } = await supabase
        .from('shopify_sync_job_queue' as any)
        .select('location_gid, vendor')
        .eq('batch_id', runData.batch_id)
        .limit(1)
        .single();

      const itemIds = (failedItems as any[]).map((i: any) => i.item_id);

      // Create a new queued job through queue-shopify-sync (fully tracked)
      const { data, error: invokeError } = await supabase.functions.invoke('queue-shopify-sync', {
        body: {
          item_ids: itemIds,
          storeKey: runData.store_key,
          locationGid: (originalJob as any)?.location_gid,
          vendor: (originalJob as any)?.vendor || null,
        }
      });

      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.error || 'Failed to queue retry job');
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Retry job queued (${data.total_items} items)`);
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-runs'] });
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-jobs'] });
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
      const { data, error } = await supabase.functions.invoke('shopify-sync-job-action', {
        body: { action: 'cancel', job_id: jobId }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Cancel failed');
      return data;
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
      const { data, error } = await supabase.functions.invoke('shopify-sync-job-action', {
        body: { action: 'resume', job_id: jobId }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Resume failed');
      return data;
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
      const { data, error } = await supabase.functions.invoke('shopify-sync-job-action', {
        body: { action: 'retry_failed', job_id: jobId }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Retry failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Retrying failed items');
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-job-items'] });
    },
    onError: (error: Error) => {
      toast.error(`Retry failed: ${error.message}`);
    },
  });
}
