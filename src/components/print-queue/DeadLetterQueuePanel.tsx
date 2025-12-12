import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, RefreshCw, Trash2, Clock } from 'lucide-react';
import { usePrintQueueContext } from '@/contexts/PrintQueueContext';
import { printQueue } from '@/lib/print/queueInstance';
import { toast } from 'sonner';

interface DeadLetterItem {
  items: any[];
  error: Error;
  timestamp: number;
}

export function DeadLetterQueuePanel() {
  const { getDeadLetterQueue, clearDeadLetterQueue } = usePrintQueueContext();
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItem[]>([]);
  const [isRetrying, setIsRetrying] = useState<number | null>(null);

  // Refresh dead letter queue periodically
  useEffect(() => {
    const refresh = () => {
      setDeadLetterItems(getDeadLetterQueue());
    };

    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [getDeadLetterQueue]);

  const handleRetry = async (index: number, items: any[]) => {
    setIsRetrying(index);
    try {
      // Re-enqueue all items from the failed batch
      for (const item of items) {
        await printQueue.enqueueSafe(item);
      }
      toast.success(`Re-queued ${items.length} item(s) for printing`);
      
      // Refresh the list
      setDeadLetterItems(getDeadLetterQueue());
    } catch (error) {
      console.error('Failed to retry:', error);
      toast.error('Failed to re-queue items');
    } finally {
      setIsRetrying(null);
    }
  };

  const handleClearAll = () => {
    clearDeadLetterQueue();
    setDeadLetterItems([]);
    toast.success('Dead letter queue cleared');
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (deadLetterItems.length === 0) {
    return null;
  }

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">Failed Print Jobs</CardTitle>
            <Badge variant="destructive">{deadLetterItems.length}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        </div>
        <CardDescription>
          These print jobs failed after multiple retry attempts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-64">
          <div className="space-y-3">
            {deadLetterItems.map((entry, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-4 p-3 bg-background rounded-lg border"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {entry.items.length} item{entry.items.length > 1 ? 's' : ''}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm text-destructive font-medium truncate">
                    {entry.error.message}
                  </div>
                  {entry.items[0]?.zpl && (
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {entry.items[0].zpl.substring(0, 80)}...
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRetry(index, entry.items)}
                  disabled={isRetrying === index}
                >
                  {isRetrying === index ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
