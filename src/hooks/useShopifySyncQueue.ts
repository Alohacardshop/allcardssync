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
  queue_position?: number
  processor_id?: string
  processor_heartbeat?: string
  retry_after?: string
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
  processorId?: string
  itemsPerMinute: number
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
    estimatedTimeRemaining: 0,
    itemsPerMinute: 0
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

      // Fetch recent queue items for display ordered by queue position
      const { data: recentItems, error: recentError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .order('queue_position', { ascending: true })
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
        // CRITICAL: Max 30 items per minute due to 2-second delays
        itemsPerMinute: Math.min(30, processingTimes.length > 0 
          ? Math.round(60000 / avgProcessingTime * 10) / 10 
          : 0)
      })

      setStats(newStats)

      // Update processing state
      const currentProcessing = allItemsArray.find(item => item.status === 'processing')
      
      // CRITICAL: Calculate estimated time based on 2-second per item processing
      const estimatedTime = newStats.queued > 0 
        ? newStats.queued * 2 // 2 seconds per item
        : 0

      // Check if processor is currently active
      const { data: processorSetting } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'SHOPIFY_PROCESSOR_ACTIVE')
        .maybeSingle()

      setProcessingState({
        isActive: newStats.processing > 0 || newStats.queued > 0,
        isPaused: false,
        currentItem: currentProcessing,
        estimatedTimeRemaining: Math.round(estimatedTime),
        processorId: processorSetting?.key_value || undefined,
        itemsPerMinute: newStats.itemsPerMinute
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

  const deleteQueueItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      fetchQueueStatus()
    } catch (err) {
      console.error('Error deleting queue item:', err)
      throw err
    }
  }

  const clearAllQueue = async () => {
    try {
      console.log('Attempting to clear all queue items...')
      const { error, count } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .gte('created_at', '1900-01-01') // Delete all records

      console.log('Clear all result:', { error, count })

      if (error) {
        console.error('Supabase error clearing queue:', error)
        throw error
      }

      console.log(`Successfully cleared ${count || 'unknown'} queue items`)
      fetchQueueStatus()
    } catch (err) {
      console.error('Error clearing all queue items:', err)
      throw err
    }
  }

  const clearFailedItems = async () => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('status', 'failed')

      if (error) throw error

      fetchQueueStatus()
    } catch (err) {
      console.error('Error clearing failed items:', err)
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
    clearCompleted,
    deleteQueueItem,
    clearAllQueue,
    clearFailedItems
  }
}