import { useQuery } from '@tanstack/react-query'
import { getInventoryAnalytics } from '@/lib/api'

export function useInventoryAnalytics() {
  return useQuery({
    queryKey: ['inventory-analytics'],
    queryFn: getInventoryAnalytics,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}