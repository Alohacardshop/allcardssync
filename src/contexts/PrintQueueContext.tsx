import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { usePrinter } from '@/hooks/usePrinter';
import { printQueue, setConfiguredPrinter } from '@/lib/print/queueInstance';
import { logger } from '@/lib/logger';

const STUCK_CHECK_INTERVAL_MS = 2000;

interface PrintQueueContextValue {
  /** Current printer name being used */
  printerName: string | null;
  /** Whether the printer is connected and ready */
  isReady: boolean;
  /** Whether the print queue is currently stuck (reactive) */
  isStuck: boolean;
  /** Current queue size */
  queueSize: number;
  /** Force reset the queue if stuck */
  forceReset: () => void;
  /** Get items that failed after retries */
  getDeadLetterQueue: () => { items: any[]; error: Error; timestamp: number }[];
  /** Clear the dead letter queue */
  clearDeadLetterQueue: () => void;
  /** Dead letter queue count (reactive) */
  deadLetterCount: number;
}

const PrintQueueContext = createContext<PrintQueueContextValue | null>(null);

interface PrintQueueProviderProps {
  children: ReactNode;
}

/**
 * Provider that synchronizes the print queue with the current user's
 * location-scoped printer configuration from usePrinter hook.
 */
export function PrintQueueProvider({ children }: PrintQueueProviderProps) {
  const { printer, isConnected } = usePrinter();
  
  // Reactive state for queue status
  const [isStuck, setIsStuck] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);

  // Sync printer config to the print queue whenever it changes
  useEffect(() => {
    const printerName = printer?.name || null;
    setConfiguredPrinter(printerName);
    
    logger.debug('PrintQueueProvider: Synced printer config', { 
      printerName,
      isConnected 
    }, 'print-queue-context');
  }, [printer?.name, isConnected]);

  // Poll queue status on interval for reactive updates
  useEffect(() => {
    const checkQueueStatus = () => {
      const stuck = printQueue.isStuck();
      const size = printQueue.size();
      const dlqSize = printQueue.getDeadLetterQueue().length;
      
      setIsStuck(prev => {
        if (prev !== stuck) {
          if (stuck) {
            logger.warn('PrintQueueProvider: Queue stuck detected', { queueSize: size }, 'print-queue-context');
          } else if (prev) {
            logger.info('PrintQueueProvider: Queue recovered from stuck state', undefined, 'print-queue-context');
          }
        }
        return stuck;
      });
      
      setQueueSize(size);
      setDeadLetterCount(dlqSize);
    };

    // Initial check
    checkQueueStatus();

    // Set up interval
    const interval = setInterval(checkQueueStatus, STUCK_CHECK_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, []);

  const forceReset = useCallback(() => {
    printQueue.forceReset();
    logger.warn('PrintQueueProvider: Force reset triggered', undefined, 'print-queue-context');
    // Immediately update state after reset
    setIsStuck(false);
    setQueueSize(printQueue.size());
  }, []);

  const clearDeadLetterQueue = useCallback(() => {
    printQueue.clearDeadLetterQueue();
    logger.info('PrintQueueProvider: Dead letter queue cleared', undefined, 'print-queue-context');
    setDeadLetterCount(0);
  }, []);

  const value: PrintQueueContextValue = {
    printerName: printer?.name || null,
    isReady: isConnected && !!printer?.name,
    isStuck,
    queueSize,
    forceReset,
    getDeadLetterQueue: () => printQueue.getDeadLetterQueue(),
    clearDeadLetterQueue,
    deadLetterCount,
  };

  return (
    <PrintQueueContext.Provider value={value}>
      {children}
    </PrintQueueContext.Provider>
  );
}

/**
 * Hook to access print queue context with scoped printer configuration.
 * Must be used within a PrintQueueProvider.
 */
export function usePrintQueueContext(): PrintQueueContextValue {
  const context = useContext(PrintQueueContext);
  
  if (!context) {
    throw new Error('usePrintQueueContext must be used within a PrintQueueProvider');
  }
  
  return context;
}

/**
 * Optional hook that returns null if not within provider.
 * Useful for components that may or may not be within the provider.
 */
export function usePrintQueueContextOptional(): PrintQueueContextValue | null {
  return useContext(PrintQueueContext);
}
