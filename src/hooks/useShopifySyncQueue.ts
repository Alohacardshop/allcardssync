import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"

export interface SyncQueueItem {
  id: string
  inventory_item_id: string
  action: 'create' | 'update' | 'delete'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  retry_count: number
  max_retries: number
  error_message?: string
  shopify_product_id?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export interface QueueStats {
  queued: number
  processing: number
  completed: number
  failed: number
  total: number
}

export function useShopifySyncQueue() {
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([])
  const [stats, setStats] = useState<QueueStats>({
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQueueStatus = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch recent queue items
      const { data: items, error: itemsError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (itemsError) throw itemsError

      setQueueItems((items || []) as SyncQueueItem[])

      // Calculate stats
      const newStats = (items || []).reduce((acc, item) => {
        acc[item.status]++
        acc.total++
        return acc
      }, {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0
      })

      setStats(newStats)
    } catch (err) {
      console.error('Error fetching queue status:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const triggerProcessor = async () => {
    try {
      await supabase.functions.invoke('shopify-sync-processor', { body: {} })
      // Refresh queue status after triggering
      setTimeout(fetchQueueStatus, 1000)
    } catch (err) {
      console.error('Error triggering processor:', err)
      throw err
    }
  }

  const retryFailedItems = async () => {
    try {
      // Reset failed items back to queued status
      const { error } = await supabase
        .from('shopify_sync_queue')
        .update({ 
          status: 'queued',
          retry_count: 0,
          error_message: null,
          started_at: null,
          completed_at: null
        })
        .eq('status', 'failed')

      if (error) throw error

      // Trigger processor
      await triggerProcessor()
    } catch (err) {
      console.error('Error retrying failed items:', err)
      throw err
    }
  }

  const clearCompleted = async () => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('status', 'completed')

      if (error) throw error

      fetchQueueStatus()
    } catch (err) {
      console.error('Error clearing completed items:', err)
      throw err
    }
  }

  // Auto-refresh every 10 seconds when there are active items
  useEffect(() => {
    fetchQueueStatus()

    const interval = setInterval(() => {
      if (stats.queued > 0 || stats.processing > 0) {
        fetchQueueStatus()
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [stats.queued, stats.processing])

  return {
    queueItems,
    stats,
    loading,
    error,
    fetchQueueStatus,
    triggerProcessor,
    retryFailedItems,
    clearCompleted
  }
}