import React from 'react';
import { usePrintQueueStatus } from '@/lib/print/usePrintQueueStatus';
import { Button } from '@/components/ui/button';

export function PrintQueueStatus() {
  const { size, flushNow, clear } = usePrintQueueStatus();

  if (size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-background border rounded-lg px-3 py-2 shadow-lg text-xs">
      <span className="text-muted-foreground">Queue: {size}</span>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={flushNow}
        className="h-6 px-2 text-xs underline"
      >
        Flush
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={clear}
        className="h-6 px-2 text-xs underline text-destructive"
      >
        Clear
      </Button>
    </div>
  );
}