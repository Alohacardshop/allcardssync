import { Link } from 'react-router-dom'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/integrations/supabase/client"
import { Package, ExternalLink } from "lucide-react"
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

interface QueueStatus {
  queued: number
  processing: number
  failed: number
}

export function QueueStatusIndicator() {
  const { data: queueStatus, isLoading } = useQuery({
    queryKey: ['shopify-queue-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .select('status')
        .in('status', ['queued', 'processing', 'failed'])

      if (error) throw error

      const stats = (data || []).reduce((acc, item) => {
        acc[item.status as keyof QueueStatus]++
        return acc
      }, { queued: 0, processing: 0, failed: 0 })

      return stats
    },
    refetchOnWindowFocus: true,
    // Only poll when there are active items (queued or processing)
    refetchInterval: (query) => {
      const data = query.state.data as QueueStatus | undefined
      const hasActiveItems = data && (data.queued > 0 || data.processing > 0)
      return hasActiveItems ? 10000 : false // Poll every 10s only if items are active
    }
  })

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('queue-status-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopify_sync_queue'
        },
        () => {
          // Invalidate query to refetch on any change
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (isLoading || !queueStatus) return null

  const totalPending = queueStatus.queued + queueStatus.processing
  if (totalPending === 0 && queueStatus.failed === 0) return null

  return (
    <Link to="/admin" onClick={() => window.location.hash = 'queue'}>
      <Button variant="outline" size="sm" className="gap-2 hover:bg-blue-50">
        <Package className="w-3 h-3" />
        <span className="text-xs">
          Shopify Queue: 
          {totalPending > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-blue-800">
              {totalPending}
            </Badge>
          )}
          {queueStatus.failed > 0 && (
            <Badge variant="destructive" className="ml-1 text-xs">
              {queueStatus.failed} failed
            </Badge>
          )}
        </span>
        <ExternalLink className="w-3 h-3" />
      </Button>
    </Link>
  )
}
