/**
 * Simple Printing Hook
 * PrintNode-only printing without local fallbacks
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { DEFAULT_ZD410_PRINTER, type PrinterConnection, type PrintResult } from '@/lib/directLocalPrint';
import { printNodeService } from '@/lib/printNodeService';
import { logger } from '@/lib/logger';

export interface PrintState {
  isLoading: boolean;
  lastResult: PrintResult | null;
}

export function useSimplePrinting() {
  const [printState, setPrintState] = useState<PrintState>({
    isLoading: false,
    lastResult: null
  });

  // Get saved printer or use default
  const getSavedPrinter = useCallback((): PrinterConnection => {
    try {
      const saved = localStorage.getItem('zebra-printer-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ip: parsed.ip || DEFAULT_ZD410_PRINTER.ip,
          port: parsed.port || DEFAULT_ZD410_PRINTER.port,
          name: parsed.name || DEFAULT_ZD410_PRINTER.name,
          printNodeId: parsed.printNodeId,
          usePrintNode: parsed.usePrintNode || false
        };
      }
    } catch (error) {
      logger.warn('Failed to load saved printer config', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'simple-printing');
    }
    return DEFAULT_ZD410_PRINTER;
  }, []);

  // Save printer config
  const savePrinterConfig = useCallback((printer: PrinterConnection) => {
    try {
      localStorage.setItem('zebra-printer-config', JSON.stringify(printer));
    } catch (error) {
      logger.warn('Failed to save printer config', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'simple-printing');
    }
  }, []);

  // Print ZPL with PrintNode only
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    logger.debug('Starting PrintNode print', { copies, zplLength: zpl.length }, 'simple-printing');
    setPrintState(prev => ({ ...prev, isLoading: true }));
    
    const printer = getSavedPrinter();
    logger.debug('Using printer configuration', { 
      name: printer.name, 
      usePrintNode: printer.usePrintNode 
    }, 'simple-printing');
    
    try {
      // Check if PrintNode is configured
      if (!printer.usePrintNode || !printer.printNodeId) {
        // Try to auto-configure if PrintNode is available
        const connected = await printNodeService.testConnection();
        if (connected) {
          const printers = await printNodeService.getPrinters();
          const onlinePrinter = printers.find(p => p.status === 'online') || printers[0];
          if (onlinePrinter) {
            // Auto-configure the first available printer
            const autoConfig = {
              ...printer,
              name: onlinePrinter.name,
              printNodeId: onlinePrinter.id,
              usePrintNode: true
            };
            savePrinterConfig(autoConfig);
            
            toast.info(`Auto-configured PrintNode printer: ${onlinePrinter.name}`);
            
            // Use the auto-configured printer
            const printNodeResult = await printNodeService.printZPL(zpl, onlinePrinter.id, copies);
            const result: PrintResult = {
              success: printNodeResult.success,
              error: printNodeResult.error
            };
            
            setPrintState({ isLoading: false, lastResult: result });
            
            if (result.success) {
              toast.success(`Successfully sent ${copies} label(s) to PrintNode`);
            } else {
              toast.error(`PrintNode failed: ${result.error}`);
            }
            
            return result;
          }
        }
        
        throw new Error('PrintNode is not configured or no printers are available. Please configure PrintNode in Test Hardware > Printer Setup.');
      }
      
      toast.info(`Sending ${copies} label(s) to PrintNode...`);
      
      logger.debug('Attempting PrintNode print', { printNodeId: printer.printNodeId, copies }, 'simple-printing');
      const printNodeResult = await printNodeService.printZPL(zpl, printer.printNodeId, copies);
      logger.debug('PrintNode result received', { success: printNodeResult.success }, 'simple-printing');
      
      const result: PrintResult = {
        success: printNodeResult.success,
        error: printNodeResult.error
      };
      
      setPrintState({
        isLoading: false,
        lastResult: result
      });
      
      if (result.success) {
        toast.success(`Successfully sent ${copies} label(s) to PrintNode`);
      } else {
        toast.error(`PrintNode failed: ${result.error}`);
        
        // Offer PrintNode-specific troubleshooting
        setTimeout(() => {
          toast.info('PrintNode Troubleshooting:', {
            description: 'Check: 1) PrintNode client is running 2) Printer is online 3) API key is valid',
            duration: 10000,
            action: {
              label: 'Open PrintNode Dashboard',
              onClick: () => window.open('https://app.printnode.com', '_blank')
            }
          });
        }, 1000);
      }
      
      return result;
    } catch (error) {
      const errorResult: PrintResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      setPrintState({
        isLoading: false,
        lastResult: errorResult
      });
      
      toast.error(`Print failed: ${errorResult.error}`);
      return errorResult;
    }
  }, [getSavedPrinter, savePrinterConfig]);

  // Test PrintNode connection
  const testConnection = useCallback(async (): Promise<PrintResult> => {
    toast.info(`Testing PrintNode connection...`);
    
    try {
      const connected = await printNodeService.testConnection();
      
      if (connected) {
        toast.success('PrintNode connection test successful!');
        return { success: true };
      } else {
        toast.error('PrintNode connection test failed. Check your API key.');
        return { success: false, error: 'PrintNode connection failed' };
      }
    } catch (error) {
      const errorResult: PrintResult = {
        success: false,
        error: error instanceof Error ? error.message : 'PrintNode connection test failed'
      };
      
      toast.error(`PrintNode connection test failed: ${errorResult.error}`);
      return errorResult;
    }
  }, []);

  // Update printer settings
  const updatePrinter = useCallback((printer: PrinterConnection) => {
    savePrinterConfig(printer);
    toast.success(`Printer updated: ${printer.name || printer.ip}`);
  }, [savePrinterConfig]);

  return {
    // State
    isLoading: printState.isLoading,
    lastResult: printState.lastResult,
    currentPrinter: getSavedPrinter(),
    
    // Actions
    print,
    testConnection,
    updatePrinter
  };
}