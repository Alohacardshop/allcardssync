import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Pause, Play, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface PrintProgressItem {
  id: string;
  label: string;
  sku?: string;
}

interface PrintProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PrintProgressItem[];
  onPrintItem: (item: PrintProgressItem) => Promise<boolean>;
  onComplete: (results: { success: number; failed: number }) => void;
  onCancel: () => void;
}

export function PrintProgressDialog({
  open,
  onOpenChange,
  items,
  onPrintItem,
  onComplete,
  onCancel,
}: PrintProgressDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentItemLabel, setCurrentItemLabel] = useState('');

  const pausedRef = useRef(isPaused);
  const cancelledRef = useRef(isCancelled);

  // Keep refs in sync
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    cancelledRef.current = isCancelled;
  }, [isCancelled]);

  // Timer for elapsed time
  useEffect(() => {
    if (!open || isComplete || isCancelled) return;

    const timer = setInterval(() => {
      if (!pausedRef.current) {
        setElapsedSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [open, isComplete, isCancelled]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setIsPaused(false);
      setIsCancelled(false);
      setSuccessCount(0);
      setFailedCount(0);
      setElapsedSeconds(0);
      setIsProcessing(false);
      setIsComplete(false);
      setCurrentItemLabel('');
    }
  }, [open]);

  // Process items
  const processItems = useCallback(async () => {
    if (isProcessing || isComplete || items.length === 0) return;

    setIsProcessing(true);
    let localSuccess = 0;
    let localFailed = 0;

    for (let i = 0; i < items.length; i++) {
      // Check for cancellation
      if (cancelledRef.current) {
        break;
      }

      // Wait while paused
      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (cancelledRef.current) {
        break;
      }

      const item = items[i];
      setCurrentIndex(i);
      setCurrentItemLabel(item.label || item.sku || `Item ${i + 1}`);

      try {
        const success = await onPrintItem(item);
        if (success) {
          localSuccess++;
          setSuccessCount(localSuccess);
        } else {
          localFailed++;
          setFailedCount(localFailed);
        }
      } catch (error) {
        console.error('Print item error:', error);
        localFailed++;
        setFailedCount(localFailed);
      }
    }

    setIsProcessing(false);
    setIsComplete(true);
    onComplete({ success: localSuccess, failed: localFailed });
  }, [items, onPrintItem, onComplete, isProcessing, isComplete]);

  // Start processing when dialog opens
  useEffect(() => {
    if (open && items.length > 0 && !isProcessing && !isComplete) {
      processItems();
    }
  }, [open, items, processItems, isProcessing, isComplete]);

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
  };

  const handleCancel = () => {
    setIsCancelled(true);
    onCancel();
    onOpenChange(false);
  };

  const handleClose = () => {
    if (isComplete || isCancelled) {
      onOpenChange(false);
    } else {
      handleCancel();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = items.length > 0 ? ((currentIndex + (isComplete ? 1 : 0)) / items.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Print Complete
              </>
            ) : isCancelled ? (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Print Cancelled
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Printing Labels
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? `Printed ${successCount} of ${items.length} labels`
              : isCancelled
              ? `Cancelled at ${currentIndex + 1} of ${items.length}`
              : `Printing ${currentIndex + 1} of ${items.length}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {currentIndex + (isComplete ? 1 : 0)} / {items.length}
              </span>
              <span>{formatTime(elapsedSeconds)} elapsed</span>
            </div>
          </div>

          {/* Current item */}
          {!isComplete && !isCancelled && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm font-medium truncate">{currentItemLabel}</div>
              {isPaused && (
                <Badge variant="secondary" className="mt-2">
                  Paused
                </Badge>
              )}
            </div>
          )}

          {/* Results summary */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              <div className="text-xs text-muted-foreground">Success</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            {!isComplete && !isCancelled && (
              <>
                <Button variant="outline" onClick={handlePauseResume}>
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button variant="destructive" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
            {(isComplete || isCancelled) && (
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
