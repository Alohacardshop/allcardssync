import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Play, Trash2, AlertCircle, Clock, CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type QueueItem = {
  id: string;
  inventory_item_id: string;
  action: string;
  status: string;
  queue_position: number;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  error_type: string | null;
  retry_count: number | null;
  max_retries: number | null;
  started_at: string | null;
  completed_at: string | null;
  intake_item?: {
    sku: string | null;
    psa_cert: string | null;
    brand_title: string | null;
    subject: string | null;
  };
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  processing: { label: 'Processing', variant: 'default', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: 'Completed', variant: 'outline', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

interface EbaySyncQueueMonitorProps {
  storeKey?: string;
}

export function EbaySyncQueueMonitor({ storeKey }: EbaySyncQueueMonitorProps) {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  const { data: queueItems, isLoading, refetch } = useQuery({
    queryKey: ['ebay-sync-queue', selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from('ebay_sync_queue')
        .select(`
          *,
          intake_item:intake_items(sku, psa_cert, brand_title, subject)
        `)
        .order('queue_position', { ascending: true })
        .limit(100);

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as QueueItem[];
    },
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const retryMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('ebay_sync_queue')
        .update({ 
          status: 'pending', 
          error_message: null,
          error_type: null,
          retry_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item queued for retry');
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-queue'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to retry: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('ebay_sync_queue')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item removed from queue');
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-queue'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ebay_sync_queue')
        .delete()
        .eq('status', 'completed');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cleared completed items');
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-queue'] });
    },
  });

  const retryAllFailedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ebay_sync_queue')
        .update({ 
          status: 'pending', 
          error_message: null,
          error_type: null,
          retry_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('status', 'failed');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('All failed items queued for retry');
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-queue'] });
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: stats.pending });
      
      const batchSize = 10;
      let processed = 0;
      let hasMore = true;
      
      while (hasMore && processed < 100) { // Safety limit
        const { data, error } = await supabase.functions.invoke('ebay-sync-processor', {
          body: { batch_size: batchSize, store_key: storeKey }
        });
        
        if (error) throw error;
        if (!data.success && data.error) throw new Error(data.error);
        
        processed += data.processed || 0;
        setProcessingProgress({ current: processed, total: stats.pending });
        
        // If less than batch_size were processed, we're done
        if ((data.processed || 0) < batchSize) {
          hasMore = false;
        }
        
        // Small delay between batches
        if (hasMore) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      return { processed };
    },
    onSuccess: (result) => {
      toast.success(`Processed ${result.processed} items`);
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-queue'] });
    },
    onError: (error: Error) => {
      toast.error('Processing failed: ' + error.message);
    },
    onSettled: () => {
      setIsProcessing(false);
      setProcessingProgress(null);
    },
  });

  const stats = {
    pending: queueItems?.filter(i => i.status === 'pending').length || 0,
    processing: queueItems?.filter(i => i.status === 'processing').length || 0,
    completed: queueItems?.filter(i => i.status === 'completed').length || 0,
    failed: queueItems?.filter(i => i.status === 'failed').length || 0,
  };

  const getItemTitle = (item: QueueItem) => {
    if (item.intake_item?.brand_title && item.intake_item?.subject) {
      return `${item.intake_item.brand_title} ${item.intake_item.subject}`;
    }
    return item.intake_item?.sku || item.intake_item?.psa_cert || item.inventory_item_id;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              eBay Sync Queue
            </CardTitle>
            <CardDescription>Monitor and manage eBay listing synchronization</CardDescription>
          </div>
          <div className="flex gap-2">
            {stats.pending > 0 && (
              <Button 
                size="sm" 
                onClick={() => processQueueMutation.mutate()}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {isProcessing ? 'Processing...' : 'Process Queue'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-3">
            <div className="text-2xl font-bold">{stats.pending}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Pending
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-primary">{stats.processing}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3" /> Processing
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Completed
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Failed
            </div>
          </Card>
        </div>

        {/* Processing Progress */}
        {isProcessing && processingProgress && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing eBay queue...
              </span>
              <span className="font-medium">
                {processingProgress.current} / {processingProgress.total}
              </span>
            </div>
            <Progress 
              value={processingProgress.total > 0 
                ? (processingProgress.current / processingProgress.total) * 100 
                : 0
              } 
            />
          </div>
        )}

        {/* Filter Tabs */}
        <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              {stats.failed > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => retryAllFailedMutation.mutate()}
                  disabled={retryAllFailedMutation.isPending}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Retry All Failed
                </Button>
              )}
              {stats.completed > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => clearCompletedMutation.mutate()}
                  disabled={clearCompletedMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Completed
                </Button>
              )}
            </div>
          </div>

          <TabsContent value={selectedStatus} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !queueItems?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No items in queue
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.queue_position}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate" title={getItemTitle(item)}>
                            {getItemTitle(item)}
                          </div>
                          {item.intake_item?.sku && (
                            <div className="text-xs text-muted-foreground">
                              SKU: {item.intake_item.sku}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {item.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={statusConfig[item.status]?.variant || 'default'}
                            className="flex items-center gap-1 w-fit"
                          >
                            {statusConfig[item.status]?.icon}
                            {statusConfig[item.status]?.label || item.status}
                          </Badge>
                          {item.retry_count != null && item.retry_count > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Retries: {item.retry_count}/{item.max_retries}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {item.error_message && (
                            <div 
                              className="max-w-[200px] text-xs text-destructive truncate cursor-help"
                              title={item.error_message}
                            >
                              <AlertCircle className="h-3 w-3 inline mr-1" />
                              {item.error_message}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => retryMutation.mutate(item.id)}
                                disabled={retryMutation.isPending}
                                title="Retry"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(item.id)}
                              disabled={deleteMutation.isPending}
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
