import { useState, useEffect, useRef } from "react"
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
  todayProcessed: number
  successRate: number
  avgProcessingTime: number
  itemsPerMinute: number
}

export interface QueueProcessingState {
  isActive: boolean
  isPaused: boolean
  currentItem?: SyncQueueItem
  estimatedTimeRemaining: number
}

export function useShopifySyncQueue() {
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([])
  const [recentItems, setRecentItems] = useState<SyncQueueItem[]>([])
  const [stats, setStats] = useState<QueueStats>({
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
    todayProcessed: 0,
    successRate: 0,
    avgProcessingTime: 0,
    itemsPerMinute: 0
  })
  const [processingState, setProcessingState] = useState<QueueProcessingState>({
    isActive: false,
    isPaused: false,
    estimatedTimeRemaining: 0
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const processingTimesRef = useRef<number[]>([])

  const fetchQueueStatus = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch all queue items for stats
      const { data: allItems, error: allItemsError } = await supabase
        .from('shopify_sync_queue')
        .select('*')

      // Fetch recent queue items for display  
      const { data: recentItems, error: recentError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (allItemsError || recentError) throw allItemsError || recentError

      setQueueItems((allItems || []) as SyncQueueItem[])
      setRecentItems((recentItems || []) as SyncQueueItem[])

      // Calculate comprehensive stats
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      const allItemsArray = (allItems || []) as SyncQueueItem[]
      const todayItems = allItemsArray.filter(item => 
        new Date(item.created_at) >= todayStart
      )

      const completedItems = allItemsArray.filter(item => 
        item.status === 'completed' && item.started_at && item.completed_at
      )

      // Calculate processing times
      const processingTimes = completedItems
        .map(item => {
          if (item.started_at && item.completed_at) {
            return new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()
          }
          return null
        })
        .filter((time): time is number => time !== null)

      const avgProcessingTime = processingTimes.length > 0 
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
        : 0

      // Update processing times reference for rate calculation
      processingTimesRef.current = processingTimes.slice(-10) // Keep last 10

      const newStats: QueueStats = allItemsArray.reduce((acc, item) => {
        acc[item.status as keyof Omit<QueueStats, 'todayProcessed' | 'successRate' | 'avgProcessingTime' | 'itemsPerMinute'>]++
        acc.total++
        return acc
      }, {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0,
        todayProcessed: todayItems.filter(item => item.status === 'completed').length,
        successRate: allItemsArray.length > 0 
          ? Math.round((allItemsArray.filter(item => item.status === 'completed').length / allItemsArray.length) * 100)
          : 0,
        avgProcessingTime: Math.round(avgProcessingTime / 1000), // Convert to seconds
        itemsPerMinute: processingTimes.length > 0 
          ? Math.round(60000 / avgProcessingTime * 10) / 10 // Items per minute with 1 decimal
          : 0
      })

      setStats(newStats)

      // Update processing state
      const currentProcessing = allItemsArray.find(item => item.status === 'processing')
      const estimatedTime = newStats.queued > 0 && avgProcessingTime > 0
        ? (newStats.queued * avgProcessingTime) / 1000 // Convert to seconds
        : 0

      setProcessingState({
        isActive: newStats.processing > 0 || newStats.queued > 0,
        isPaused: false, // This would need to be managed separately
        currentItem: currentProcessing,
        estimatedTimeRemaining: Math.round(estimatedTime)
      })

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

  // Auto-refresh every 5 seconds when there are active items
  useEffect(() => {
    fetchQueueStatus()

    const interval = setInterval(() => {
      fetchQueueStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return {
    queueItems,
    recentItems,
    stats,
    processingState,
    loading,
    error,
    fetchQueueStatus,
    triggerProcessor,
    retryFailedItems,
    clearCompleted
  }
}