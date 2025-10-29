import { QueryClient } from '@tanstack/react-query';

// Query key factory for consistency
export const queryKeys = {
  currentBatch: (storeKey?: string | null, locationGid?: string | null) => 
    ['currentBatch', storeKey, locationGid].filter(Boolean),
};

// Sane React Query defaults - no blind polling
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // Data is fresh for 1 minute (standardized)
      gcTime: 5 * 60_000, // Cache data for 5 minutes (gcTime replaces cacheTime)
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchInterval: false, // NO automatic polling by default
      retry: 2, // Retry failed requests twice
      refetchOnMount: true, // Refetch when component mounts if data is stale
    },
    mutations: {
      retry: 1, // Retry mutations once on failure
      onError: (error) => {
        // Global error handler for mutations
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Mutation error:', error);
        }
      },
    },
  },
});

// Query deduplication logging (development only)
if (process.env.NODE_ENV === 'development') {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'added') {
      console.log('🔄 Query cache added:', event.query.queryKey);
    } else if (event.type === 'removed') {
      console.log('🗑️ Query cache removed:', event.query.queryKey);
    }
  });
}

// Helper to invalidate queries with toast notification
export const invalidateWithToast = async (
  queryClient: QueryClient,
  queryKey: unknown,
  toastFn?: (message: string) => void
) => {
  const previousData = queryClient.getQueryData(queryKey as any);
  
  await queryClient.invalidateQueries({ queryKey: queryKey as any });
  
  // Wait for refetch to complete
  setTimeout(() => {
    const newData = queryClient.getQueryData(queryKey as any);
    
    if (toastFn && previousData && newData && previousData !== newData) {
      // Simple diff detection - you can make this more sophisticated
      toastFn("Data updated since last view");
    }
  }, 1000);
};