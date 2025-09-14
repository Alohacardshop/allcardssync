import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useShopifySyncQueue } from "@/hooks/useShopifySyncQueue"
import { toast } from "sonner"
import { RefreshCw, Play, Trash2, RotateCcw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function ShopifySyncQueue() {
  const { 
    queueItems, 
    stats, 
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

  const getStatusBadge = (status: string) => {
    const variants = {
      queued: "secondary",
      processing: "default", 
      completed: "outline",
      failed: "destructive"
    } as const
    
    const colors = {
      queued: "text-orange-600",
      processing: "text-blue-600",
      completed: "text-green-600", 
      failed: "text-red-600"
    }
    
    return (
      <Badge 
        variant={variants[status as keyof typeof variants] || "secondary"}
        className={colors[status as keyof typeof colors] || ""}
      >
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Shopify Sync Queue</h3>
        <p className="text-sm text-muted-foreground">
          Monitor and manage inventory items being synced to Shopify
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Queued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.queued}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Queue Management
            <Button
              variant="outline"
              size="sm"
              onClick={fetchQueueStatus}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Control the Shopify sync queue processor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              onClick={handleTriggerProcessor}
              disabled={isTriggering || stats.queued === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              {isTriggering ? "Starting..." : "Start Processor"}
            </Button>
            
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
          </div>
        </CardContent>
      </Card>

      {/* Queue Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Queue Items</CardTitle>
          <CardDescription>
            Last 50 items in the sync queue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-red-600 text-center py-4">
              Error: {error}
            </div>
          ) : loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in sync queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.action}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.inventory_item_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {item.retry_count} / {item.max_retries}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs text-red-600 max-w-xs truncate">
                      {item.error_message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}