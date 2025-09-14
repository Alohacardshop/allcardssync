import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useShopifySyncQueue } from "@/hooks/useShopifySyncQueue"
import { toast } from "sonner"
import { 
  RefreshCw, 
  Play, 
  Trash2, 
  RotateCcw, 
  Pause, 
  ChevronDown,
  AlertTriangle,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  Activity
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function ShopifySyncQueueEnhanced() {
  const { 
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
  } = useShopifySyncQueue()
  
  const [isTriggering, setIsTriggering] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const handleTriggerProcessor = async () => {
    setIsTriggering(true)
    try {
      await triggerProcessor()
      toast.success("Sync processor triggered successfully")
    } catch (err) {
      console.error("Error triggering processor:", err)
      toast.error("Failed to trigger sync processor")
    } finally {
      setIsTriggering(false)
    }
  }

  const handleRetryFailed = async () => {
    setIsRetrying(true)
    try {
      await retryFailedItems()
      toast.success("Failed items reset for retry")
    } catch (err) {
      console.error("Error retrying failed items:", err)
      toast.error("Failed to retry items")
    } finally {
      setIsRetrying(false)
    }
  }

  const handleClearCompleted = async () => {
    setIsClearing(true)
    try {
      await clearCompleted()
      toast.success("Completed items cleared")
    } catch (err) {
      console.error("Error clearing completed items:", err)
      toast.error("Failed to clear completed items")
    } finally {
      setIsClearing(false)
    }
  }

  const getStatusBadge = (status: string, isRecent?: boolean) => {
    const variants = {
      queued: "secondary",
      processing: "default", 
      completed: "outline",
      failed: "destructive"
    } as const
    
    const colors = {
      queued: "text-orange-600",
      processing: "text-blue-600 animate-pulse",
      completed: "text-green-600", 
      failed: "text-red-600"
    }
    
    return (
      <Badge 
        variant={variants[status as keyof typeof variants] || "secondary"}
        className={`${colors[status as keyof typeof colors] || ""} ${isRecent ? 'ring-2 ring-primary/20' : ''}`}
      >
        {status}
      </Badge>
    )
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  // Calculate progress percentage
  const totalProcessed = stats.completed + stats.failed
  const progressPercentage = stats.total > 0 ? (totalProcessed / stats.total) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Shopify Sync Queue</h2>
          <p className="text-muted-foreground">
            Monitor and manage inventory items being synced to Shopify
          </p>
        </div>
        <div className="flex items-center gap-2">
          {processingState.isActive && (
            <Badge variant="secondary" className="animate-pulse">
              <Activity className="w-3 h-3 mr-1" />
              Processing Active
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueueStatus}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert for backed up queue */}
      {stats.queued > 50 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-800">Queue Backed Up</p>
                <p className="text-sm text-orange-700">
                  {stats.queued} items queued. Consider processing to avoid delays.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.queued}</div>
            {processingState.estimatedTimeRemaining > 0 && (
              <p className="text-xs text-muted-foreground">
                ~{formatTime(processingState.estimatedTimeRemaining)} remaining
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            {processingState.currentItem && (
              <p className="text-xs text-muted-foreground truncate">
                {processingState.currentItem.inventory_item_id.slice(0, 8)}...
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">
              {stats.todayProcessed} today
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.itemsPerMinute}/min avg
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.avgProcessingTime}s avg time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {stats.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={progressPercentage} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{totalProcessed} of {stats.total} processed</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Queue Controls
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerProcessor}
                disabled={isTriggering || stats.queued === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                {isTriggering ? "Starting..." : "Process Now"}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Control and manage the Shopify sync queue processor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleRetryFailed}
              disabled={isRetrying || stats.failed === 0}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isRetrying ? "Retrying..." : `Retry Failed (${stats.failed})`}
            </Button>
            
            <Button
              variant="outline"
              onClick={handleClearCompleted}
              disabled={isClearing || stats.completed === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isClearing ? "Clearing..." : `Clear Completed (${stats.completed})`}
            </Button>

            <Button
              variant="outline"
              disabled
              title="Coming soon"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue Details */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Recent Queue Items ({recentItems.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
              <CardDescription>
                Last 20 items in the sync queue
              </CardDescription>
            </CardHeader>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card>
            <CardContent className="pt-6">
              {error ? (
                <div className="text-red-600 text-center py-4">
                  Error: {error}
                </div>
              ) : loading ? (
                <div className="text-center py-4">Loading...</div>
              ) : recentItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items in sync queue
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Item ID</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="min-w-[200px]">Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentItems.map((item, index) => {
                        const isRecent = index < 3 && item.status === 'completed'
                        return (
                          <TableRow key={item.id} className={isRecent ? 'bg-green-50' : ''}>
                            <TableCell>
                              {getStatusBadge(item.status, isRecent)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.action}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.inventory_item_id.slice(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <span className={item.retry_count >= item.max_retries ? 'text-red-600' : ''}>
                                {item.retry_count} / {item.max_retries}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="text-xs text-red-600 max-w-xs">
                              <div className="truncate" title={item.error_message}>
                                {item.error_message}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}