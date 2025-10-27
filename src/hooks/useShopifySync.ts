import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface QueueItem {
  id: string
  inventory_item_id: string
  action: 'create' | 'update' | 'delete'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  retry_count: number
  max_retries: number
  created_at: string
  completed_at?: string
  error_message?: string
  retry_after?: string
}

interface QueueStats {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  success_rate: number
}

export function useShopifySync() {
  const queryClient = useQueryClient()

  // Fetch queue items with real-time updates
  const { data: queueItems = [], isLoading, error } = useQuery({
    queryKey: ['shopify-sync-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (error) throw error
      return data as QueueItem[]
    },
    refetchOnWindowFocus: true,
    // No fixed polling - rely on real-time subscription
  })

  // Set up real-time subscription for queue updates
  useEffect(() => {
    const channel = supabase
      .channel('shopify-sync-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopify_sync_queue'
        },
        () => {
          // Invalidate and refetch when queue changes
          queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Calculate enhanced stats with processing metrics
  const stats: QueueStats & { 
    currentProcessing?: QueueItem;
    processingRate?: number;
    estimatedTimeRemaining?: number;
  } = {
    total: queueItems.length,
    queued: queueItems.filter(item => item.status === 'queued').length,
    processing: queueItems.filter(item => item.status === 'processing').length,
    completed: queueItems.filter(item => item.status === 'completed').length,
    failed: queueItems.filter(item => item.status === 'failed').length,
    success_rate: queueItems.length > 0 
      ? Math.round((queueItems.filter(item => item.status === 'completed').length / queueItems.length) * 100)
      : 0,
    currentProcessing: queueItems.find(item => item.status === 'processing'),
    processingRate: (() => {
      // Calculate items processed in last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const recentlyCompleted = queueItems.filter(item => 
        item.status === 'completed' && 
        item.completed_at && 
        new Date(item.completed_at) > fiveMinutesAgo
      ).length
      return recentlyCompleted / 5 // items per minute
    })(),
    estimatedTimeRemaining: (() => {
      const queued = queueItems.filter(item => item.status === 'queued').length
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const recentlyCompleted = queueItems.filter(item => 
        item.status === 'completed' && 
        item.completed_at && 
        new Date(item.completed_at) > fiveMinutesAgo
      ).length
      const rate = recentlyCompleted / 5
      return rate > 0 ? Math.ceil(queued / rate) : null
    })()
  }

  // Trigger sync processor
  const triggerProcessor = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('shopify-sync', {
        body: {}
      })
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Sync processor started - processed ${data.processed} items`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
    },
    onError: (error) => {
      logger.error('Sync processor error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to start sync processor: ${error.message}`)
    }
  })

  // Add items to queue
  const addToQueue = useMutation({
    mutationFn: async ({ itemIds, action }: { itemIds: string[], action: 'create' | 'update' | 'delete' }) => {
      const queueItems = itemIds.map(itemId => ({
        inventory_item_id: itemId,
        action,
        status: 'queued',
        retry_count: 0,
        max_retries: 3
      }))
      
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .insert(queueItems)
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Added ${data.length} items to sync queue`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
      
      // Auto-trigger processor
      setTimeout(() => {
        triggerProcessor.mutate()
      }, 1000)
    },
    onError: (error) => {
      logger.error('Add to queue error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to add items to queue: ${error.message}`)
    }
  })

  // Retry failed items
  const retryFailed = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .update({ 
          status: 'queued', 
          retry_count: 0,
          retry_after: null,
          error_message: null
        })
        .eq('status', 'failed')
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Reset ${data.length} failed items for retry`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
      
      // Auto-trigger processor
      setTimeout(() => {
        triggerProcessor.mutate()
      }, 1000)
    },
    onError: (error) => {
      logger.error('Retry failed error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to retry items: ${error.message}`)
    }
  })

  // Clear completed items
  const clearCompleted = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('status', 'completed')
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Cleared ${data.length} completed items`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
    },
    onError: (error) => {
      logger.error('Clear completed error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to clear completed items: ${error.message}`)
    }
  })

  // Clear all items
  const clearAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Cleared ${data.length} items from queue`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
    },
    onError: (error) => {
      logger.error('Clear all error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to clear queue: ${error.message}`)
    }
  })

  // Delete single item
  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('id', itemId)
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.length} item from queue`)
      queryClient.invalidateQueries({ queryKey: ['shopify-sync-queue'] })
    },
    onError: (error) => {
      logger.error('Delete item error', error instanceof Error ? error : new Error(String(error)), {}, 'useShopifySync')
      toast.error(`Failed to delete item: ${error.message}`)
    }
  })

  return {
    queueItems,
    stats,
    isLoading,
    error,
    triggerProcessor,
    addToQueue,
    retryFailed,
    clearCompleted,
    clearAll,
    deleteItem
  }
}