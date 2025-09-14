import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/integrations/supabase/client"
import { Package, ExternalLink } from "lucide-react"

interface QueueStatus {
  queued: number
  processing: number
  failed: number
}

export function QueueStatusIndicator() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ queued: 0, processing: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  const fetchQueueStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .select('status')
        .in('status', ['queued', 'processing', 'failed'])

      if (error) throw error

      const stats = (data || []).reduce((acc, item) => {
        acc[item.status as keyof QueueStatus]++
        return acc
      }, { queued: 0, processing: 0, failed: 0 })

      setQueueStatus(stats)
    } catch (error) {
      console.error('Error fetching queue status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueueStatus()
    
    // Refresh every 10 seconds
    const interval = setInterval(fetchQueueStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return null

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