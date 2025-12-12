import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { usePrinter } from '@/hooks/usePrinter';
import { printQueue, setConfiguredPrinter } from '@/lib/print/queueInstance';
import { logger } from '@/lib/logger';

interface PrintQueueContextValue {
  /** Current printer name being used */
  printerName: string | null;
  /** Whether the printer is connected and ready */
  isReady: boolean;
  /** Check if the print queue is stuck */
  isStuck: boolean;
  /** Force reset the queue if stuck */
  forceReset: () => void;
  /** Get items that failed after retries */
  getDeadLetterQueue: () => { items: any[]; error: Error; timestamp: number }[];
  /** Clear the dead letter queue */
  clearDeadLetterQueue: () => void;
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

  // Sync printer config to the print queue whenever it changes
  useEffect(() => {
    const printerName = printer?.name || null;
    setConfiguredPrinter(printerName);
    
    logger.debug('PrintQueueProvider: Synced printer config', { 
      printerName,
      isConnected 
    }, 'print-queue-context');
  }, [printer?.name, isConnected]);

  const value: PrintQueueContextValue = {
    printerName: printer?.name || null,
    isReady: isConnected && !!printer?.name,
    isStuck: printQueue.isStuck(),
    forceReset: () => {
      printQueue.forceReset();
      logger.warn('PrintQueueProvider: Force reset triggered', undefined, 'print-queue-context');
    },
    getDeadLetterQueue: () => printQueue.getDeadLetterQueue(),
    clearDeadLetterQueue: () => {
      printQueue.clearDeadLetterQueue();
      logger.info('PrintQueueProvider: Dead letter queue cleared', undefined, 'print-queue-context');
    }
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
