import { useQuery } from '@tanstack/react-query'
import { getInventoryAnalytics } from '@/lib/api'

export function useInventoryAnalytics(storeKey?: string, locationGid?: string) {
  return useQuery({
    queryKey: ['inventory-analytics', storeKey, locationGid],
    queryFn: () => getInventoryAnalytics(storeKey, locationGid),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}