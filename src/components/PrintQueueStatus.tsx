import React from 'react';
import { printQueue } from '@/lib/print/queueInstance';
import { Button } from '@/components/ui/button';

export function PrintQueueStatus() {
  const [size, setSize] = React.useState(printQueue.size());
  
  // Poll queue size only when queue has items (reduced from 500ms to 2000ms)
  React.useEffect(() => {
    const pollInterval = size > 0 ? 2000 : 5000; // Poll faster when queue active
    const interval = setInterval(() => {
      const currentSize = printQueue.size();
      setSize(currentSize);
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [size]);
  
  const handleFlush = () => {
    printQueue.flushNow();
    setSize(0);
  };
  
  const handleClear = () => {
    printQueue.clear();
    setSize(0);
  };

  if (size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-background border rounded-lg px-3 py-2 shadow-lg text-xs">
      <span className="text-muted-foreground">Queue: {size}</span>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={handleFlush}
        className="h-6 px-2 text-xs underline"
      >
        Flush
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={handleClear}
        className="h-6 px-2 text-xs underline text-destructive"
      >
        Clear
      </Button>
    </div>
  );
}