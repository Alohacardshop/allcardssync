import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInventoryAnalytics } from '@/lib/api'
import { useStore } from '@/contexts/StoreContext'
import { useEffect } from 'react'

export function useInventoryAnalytics(storeKey?: string, locationGid?: string) {
  return useQuery({
    queryKey: ['inventory-analytics', storeKey, locationGid],
    queryFn: () => getInventoryAnalytics(storeKey, locationGid),
    staleTime: 15 * 60 * 1000, // 15 minutes - longer cache for faster switching
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000, // Background refresh every 5 minutes
    refetchIntervalInBackground: true,
  })
}

// Hook to prefetch analytics for all user stores
export function usePrefetchAnalytics() {
  const queryClient = useQueryClient()
  const { userAssignments } = useStore()

  useEffect(() => {
    // Prefetch analytics for all assigned store/location combinations
    userAssignments.forEach(async (assignment) => {
      await queryClient.prefetchQuery({
        queryKey: ['inventory-analytics', assignment.store_key, assignment.location_gid],
        queryFn: () => getInventoryAnalytics(assignment.store_key, assignment.location_gid),
        staleTime: 15 * 60 * 1000,
      })
    })
  }, [userAssignments, queryClient])
}