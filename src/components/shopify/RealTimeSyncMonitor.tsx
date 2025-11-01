import { useEffect } from "react"
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  PlayCircle, 
  PauseCircle,
  RotateCcw,
  Trash2,
  AlertTriangle
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface QueueItem {
  id: string
  inventory_item_id: string
  action: string // Changed from literal types to string
  status: string // Changed from literal types to string
  retry_count: number
  max_retries: number
  error_message?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

interface QueueStats {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  processingRate: number // items per minute
  avgProcessingTime: number // in seconds
  successRate: number // percentage
}

export function RealTimeSyncMonitor() {
  const queryClient = useQueryClient()
  
  const { data: queueData, isLoading, error: queryError } = useQuery({
    queryKey: ['sync-monitor-queue'],
    queryFn: async () => {
      // Fetch recent queue items
    const { data: items, error } = await supabase
      .from('shopify_sync_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching sync queue:', error)
      throw error
    }

    if (!items) return { items: [], stats: getEmptyStats() }
    
    console.log('Sync monitor: fetched', items.length, 'items')
    
    // Calculate stats
    const total = items.length
    const queued = items.filter(i => i.status === 'queued').length
    const processing = items.filter(i => i.status === 'processing').length
    const completed = items.filter(i => i.status === 'completed').length
    const failed = items.filter(i => i.status === 'failed').length
    
    // Calculate processing rate (items completed in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentCompleted = items.filter(i => 
      i.status === 'completed' && 
      new Date(i.completed_at!) > oneHourAgo
    )
    const processingRate = recentCompleted.length

    // Calculate average processing time
    const completedWithTimes = items.filter(i => 
      i.status === 'completed' && i.started_at && i.completed_at
    )
    let avgProcessingTime = 0
    if (completedWithTimes.length > 0) {
      const totalTime = completedWithTimes.reduce((sum, item) => {
        const start = new Date(item.started_at!).getTime()
        const end = new Date(item.completed_at!).getTime()
        return sum + (end - start)
      }, 0)
      avgProcessingTime = Math.round(totalTime / completedWithTimes.length / 1000)
    }

    // Calculate success rate
    const processed = completed + failed
    const successRate = processed > 0 ? Math.round((completed / processed) * 100) : 0

    const stats: QueueStats = {
      total,
      queued,
      processing,
      completed,
      failed,
      processingRate,
      avgProcessingTime,
      successRate
    }

    return { items, stats }
    },
    refetchOnWindowFocus: true,
    // No fixed polling - rely on real-time subscription
  })

  const queueItems = queueData?.items || []
  const stats = queueData?.stats || getEmptyStats()

  // Show error if query failed
  if (queryError) {
    console.error('Sync monitor query error:', queryError)
  }

  function getEmptyStats(): QueueStats {
    return {
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      processingRate: 0,
      avgProcessingTime: 0,
      successRate: 0
    }
  }

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('sync-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopify_sync_queue'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sync-monitor-queue'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const handleStartProcessor = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync')
      
      if (error) throw error
      
      toast.success('Sync processor started successfully')
      queryClient.invalidateQueries({ queryKey: ['sync-monitor-queue'] })
    } catch (error: any) {
      console.error('Error starting processor:', error)
      toast.error(`Failed to start processor: ${error.message}`)
    }
  }

  const handleRetryFailed = async () => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .update({ status: 'queued', retry_count: 0 })
        .eq('status', 'failed')
        .lt('retry_count', 'max_retries')

      if (error) throw error

      toast.success('Failed items queued for retry')
      queryClient.invalidateQueries({ queryKey: ['sync-monitor-queue'] })
    } catch (error: any) {
      console.error('Error retrying failed items:', error)
      toast.error(`Failed to retry items: ${error.message}`)
    }
  }

  const handleClearCompleted = async () => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('status', 'completed')

      if (error) throw error

      toast.success('Completed items cleared')
      queryClient.invalidateQueries({ queryKey: ['sync-monitor-queue'] })
    } catch (error: any) {
      console.error('Error clearing completed items:', error)
      toast.error(`Failed to clear items: ${error.message}`)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      toast.success('Item deleted')
      queryClient.invalidateQueries({ queryKey: ['sync-monitor-queue'] })
    } catch (error: any) {
      console.error('Error deleting item:', error)
      toast.error(`Failed to delete item: ${error.message}`)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="h-4 w-4" />
      case 'processing': return <Activity className="h-4 w-4 animate-spin" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'failed': return <XCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'default'
      case 'processing': return 'default'
      case 'completed': return 'default'
      case 'failed': return 'destructive'
      default: return 'secondary'
    }
  }

  return (
    <div className="space-y-6">
      {queryError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p>Error loading sync queue: {(queryError as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Loading sync queue...</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && queueItems.length === 0 && !queryError && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No items in sync queue</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Queued</p>
                <p className="text-2xl font-bold">{stats.queued}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Processing</p>
                <p className="text-2xl font-bold">{stats.processing}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{stats.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Success Rate</p>
              <div className="flex items-center gap-2">
                <Progress value={stats.successRate} className="flex-1" />
                <span className="text-sm font-medium">{stats.successRate}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Processing Rate</p>
              <p className="text-xl font-semibold">{stats.processingRate}/hour</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Processing Time</p>
              <p className="text-xl font-semibold">{stats.avgProcessingTime}s</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleStartProcessor}
              className="flex items-center gap-2"
            >
              <PlayCircle className="h-4 w-4" />
              Start Processor
            </Button>

            <Button 
              onClick={handleRetryFailed}
              variant="outline"
              disabled={stats.failed === 0}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Failed ({stats.failed})
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline"
                  disabled={stats.completed === 0}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Completed
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Completed Items</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all completed sync items older than 24 hours. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearCompleted}>
                    Clear Items
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Recent Queue Items */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Queue Items</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No queue items found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queueItems.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(item.status)}
                    <div>
                      <p className="text-sm font-medium">
                        {item.action.charAt(0).toUpperCase() + item.action.slice(1)} Item
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {item.inventory_item_id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusColor(item.status) as any}>
                      {item.status}
                    </Badge>
                    {item.retry_count > 0 && (
                      <Badge variant="outline">
                        Retry {item.retry_count}/{item.max_retries}
                      </Badge>
                    )}
                    {item.error_message && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toast.error(item.error_message)}
                      >
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}