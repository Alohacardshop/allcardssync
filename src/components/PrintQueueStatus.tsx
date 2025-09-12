import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Printer, Clock, AlertTriangle, CheckCircle, Trash2 } from "lucide-react";
import { usePrintQueue } from "@/hooks/usePrintQueue";

export function PrintQueueStatus() {
  const { queueStatus, clearQueue } = usePrintQueue();

  if (queueStatus.queueLength === 0 && !queueStatus.isProcessing) {
    return null; // Hide when queue is empty
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Queue
          </CardTitle>
          {queueStatus.queueLength > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearQueue}
              className="h-8"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Queue
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {queueStatus.isProcessing ? (
              <>
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm text-muted-foreground">Processing...</span>
              </>
            ) : queueStatus.queueLength > 0 ? (
              <>
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Waiting</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Queue Empty</span>
              </>
            )}
          </div>
          <Badge variant="outline">
            {queueStatus.queueLength} queued
          </Badge>
        </div>

        {/* Current Job */}
        {queueStatus.currentJob && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Current Job</span>
              <Badge variant="secondary">
                {queueStatus.currentJob.copies}x copies
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              ID: {queueStatus.currentJob.id.substring(0, 8)}...
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {queueStatus.isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Processing</span>
              <span className="text-muted-foreground">Please wait...</span>
            </div>
            <Progress value={undefined} className="h-2" /> {/* Indeterminate progress */}
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {queueStatus.totalProcessed}
            </div>
            <div className="text-xs text-muted-foreground">Printed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {queueStatus.totalErrors}
            </div>
            <div className="text-xs text-muted-foreground">Errors</div>
          </div>
        </div>

        {/* Warning if errors */}
        {queueStatus.totalErrors > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 text-yellow-800 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              Some print jobs failed. Check printer connection.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}