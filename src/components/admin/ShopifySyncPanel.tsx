import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useShopifySync } from '@/hooks/useShopifySync'
import { Play, RotateCcw, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ShopifySyncPanelProps {
  onRefresh?: () => void;
}

export function ShopifySyncPanel({ onRefresh }: ShopifySyncPanelProps = {}) {
  const {
    queueItems,
    stats,
    isLoading,
    triggerProcessor,
    retryFailed,
    clearCompleted,
    clearAll,
    deleteItem
  } = useShopifySync()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="h-4 w-4" />
      case 'processing': return <RefreshCw className="h-4 w-4 animate-spin" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'failed': return <XCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'queued': return 'secondary'
      case 'processing': return 'default'
      case 'completed': return 'default'
      case 'failed': return 'destructive'
      default: return 'secondary'
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shopify Sync</CardTitle>
          <CardDescription>Loading sync status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Progress Display */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Sync Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span>Progress: {stats.completed + stats.failed} / {stats.total}</span>
                <span>{stats.success_rate}% Success Rate</span>
              </div>
              <Progress 
                value={(stats.completed + stats.failed) / stats.total * 100} 
                className="h-3"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Processing Rate</div>
                  <div className="font-semibold">
                    {stats.processingRate ? `${stats.processingRate.toFixed(1)}/min` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Est. Time Left</div>
                  <div className="font-semibold">
                    {stats.estimatedTimeRemaining ? `${stats.estimatedTimeRemaining} min` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Current Item</div>
                  <div className="font-mono text-xs">
                    {stats.currentProcessing ? 
                      `...${stats.currentProcessing.inventory_item_id.slice(-8)}` : 
                      'None'
                    }
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Queue Size</div>
                  <div className="font-semibold text-yellow-600">{stats.queued}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.queued}</div>
            <div className="text-sm text-muted-foreground">Queued</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            <div className="text-sm text-muted-foreground">Processing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Controls</CardTitle>
          <CardDescription>Manage the Shopify synchronization process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => triggerProcessor.mutate()}
              disabled={triggerProcessor.isPending}
              className="flex items-center gap-2"
            >
              {triggerProcessor.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Process Queue
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => retryFailed.mutate()}
              disabled={retryFailed.isPending || stats.failed === 0}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Failed ({stats.failed})
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => clearCompleted.mutate()}
              disabled={clearCompleted.isPending || stats.completed === 0}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear Completed ({stats.completed})
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline"
                  disabled={clearAll.isPending || stats.total === 0}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Queue Items?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all items from the sync queue, including queued items that haven't been processed yet.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearAll.mutate()}>
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          
          {stats.total > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="text-sm">
                <strong>Success Rate:</strong> {stats.success_rate}%
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue Items */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Queue Items</CardTitle>
          <CardDescription>Latest items in the synchronization queue</CardDescription>
        </CardHeader>
        <CardContent>
          {queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in queue
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.slice(0, 20).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={getStatusVariant(item.status)} className="flex items-center gap-1 w-fit">
                          {getStatusIcon(item.status)}
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.inventory_item_id.slice(-8)}
                      </TableCell>
                      <TableCell>
                        {item.retry_count}/{item.max_retries}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {item.error_message && (
                          <div className="text-sm text-red-600 truncate" title={item.error_message}>
                            {item.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              disabled={deleteItem.isPending}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Queue Item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove this item from the sync queue. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteItem.mutate(item.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}