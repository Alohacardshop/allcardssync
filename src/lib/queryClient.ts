import { QueryClient } from '@tanstack/react-query';

// Sane React Query defaults - no blind polling
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // Data is fresh for 30 seconds
      gcTime: 5 * 60_000, // Cache data for 5 minutes (gcTime replaces cacheTime)
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchInterval: false, // NO automatic polling by default
      retry: 2, // Retry failed requests twice
      refetchOnMount: true, // Refetch when component mounts if data is stale
    },
    mutations: {
      retry: 1, // Retry mutations once on failure
    },
  },
});

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