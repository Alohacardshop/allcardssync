import { useEffect, useState } from "react";
import { printQueue } from "./queueInstance";

export function usePrintQueueStatus(pollMs = 500) {
  const [size, setSize] = useState(printQueue.size());
  
  useEffect(() => {
    const t = setInterval(() => setSize(printQueue.size()), pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
  
  return { 
    size, 
    flushNow: () => printQueue.flushNow(), 
    clear: () => printQueue.clear() 
  };
}