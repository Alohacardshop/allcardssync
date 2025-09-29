/**
 * Hook for conditional polling of long-running jobs
 * Only polls while job is running, stops automatically when complete
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

interface JobStatus {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  error?: string;
}

interface ConditionalJobPollingOptions {
  queryKey: unknown[];
  queryFn: () => Promise<JobStatus>;
  enabled?: boolean;
  pollingInterval?: number;
  onStatusChange?: (status: JobStatus) => void;
}

export function useConditionalJobPolling({
  queryKey,
  queryFn,
  enabled = true,
  pollingInterval = 5000,
  onStatusChange
}: ConditionalJobPollingOptions) {
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: 0, // Always consider job status stale
    refetchInterval: (query) => {
      // Only poll if job is actively running
      const jobData = query.state.data as JobStatus | undefined;
      const isRunning = jobData?.status === 'running' || jobData?.status === 'queued';
      return enabled && isRunning ? pollingInterval : false;
    },
    refetchOnWindowFocus: true,
  });

  // Call status change handler when status changes
  React.useEffect(() => {
    if (data && onStatusChange) {
      onStatusChange(data);
    }
  }, [data, onStatusChange]);

  const isActive = data?.status === 'running' || data?.status === 'queued';
  const isComplete = data?.status === 'completed';
  const isFailed = data?.status === 'failed';

  return {
    status: data,
    isLoading,
    error,
    refetch,
    isPolling: isActive,
    isActive,
    isComplete,
    isFailed,
  };
}

// Specific hooks for common job types

export function useShopifyPushPolling(batchId: string, enabled: boolean = true) {
  return useConditionalJobPolling({
    queryKey: ['shopifyPush', batchId],
    queryFn: async () => {
      // This would be replaced with actual Shopify push status check
      const response = await fetch(`/api/shopify-push/${batchId}/status`);
      return response.json();
    },
    enabled,
    pollingInterval: 3000, // Faster polling for critical operations
  });
}

export function useLabelGenerationPolling(jobId: string, enabled: boolean = true) {
  return useConditionalJobPolling({
    queryKey: ['labelGeneration', jobId],
    queryFn: async () => {
      // This would be replaced with actual label generation status check
      const response = await fetch(`/api/labels/generate/${jobId}/status`);
      return response.json();
    },
    enabled,
    pollingInterval: 2000, // Very fast for print jobs
  });
}

export function useBulkImportPolling(importId: string, enabled: boolean = true) {
  return useConditionalJobPolling({
    queryKey: ['bulkImport', importId],
    queryFn: async () => {
      // This would be replaced with actual import status check
      const response = await fetch(`/api/import/${importId}/status`);
      return response.json();
    },
    enabled,
    pollingInterval: 5000, // Slower for bulk operations
  });
}