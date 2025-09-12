/**
 * Simple Printing Hook
 * Direct, immediate printing without queues or complex state
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { printZPLDirect, testPrinterConnection, DEFAULT_ZD410_PRINTER, type PrinterConnection, type PrintResult } from '@/lib/directLocalPrint';

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
          name: parsed.name || DEFAULT_ZD410_PRINTER.name
        };
      }
    } catch (error) {
      console.warn('Failed to load saved printer config:', error);
    }
    return DEFAULT_ZD410_PRINTER;
  }, []);

  // Save printer config
  const savePrinterConfig = useCallback((printer: PrinterConnection) => {
    try {
      localStorage.setItem('zebra-printer-config', JSON.stringify(printer));
    } catch (error) {
      console.warn('Failed to save printer config:', error);
    }
  }, []);

  // Print ZPL directly
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    setPrintState(prev => ({ ...prev, isLoading: true }));
    
    const printer = getSavedPrinter();
    
    try {
      toast.info(`Sending ${copies} label(s) to ${printer.name || printer.ip}...`);
      
      const result = await printZPLDirect(zpl, printer, copies);
      
      setPrintState({
        isLoading: false,
        lastResult: result
      });
      
      if (result.success) {
        toast.success(`Print sent successfully!`);
      } else {
        toast.error(`Print failed: ${result.error}`);
        
        // Offer quick troubleshooting
        setTimeout(() => {
          toast.info('Troubleshooting:', {
            description: 'Check: 1) Printer power 2) Network connection 3) Same WiFi network',
            duration: 10000,
            action: {
              label: 'Open Printer Web UI',
              onClick: () => window.open(`http://${printer.ip}`, '_blank')
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
  }, [getSavedPrinter]);

  // Test printer connection
  const testConnection = useCallback(async (): Promise<PrintResult> => {
    const printer = getSavedPrinter();
    
    toast.info(`Testing connection to ${printer.name || printer.ip}...`);
    
    try {
      const result = await testPrinterConnection(printer);
      
      if (result.success) {
        toast.success('Printer connection test successful!');
      } else {
        if (result.error?.includes('CORS') || result.error?.includes('Failed to fetch')) {
          toast.info('Connection test blocked by browser security - this is normal. Try printing a test label to verify the printer works.');
        } else {
          toast.error(`Connection test failed: ${result.error}`);
        }
      }
      
      return result;
    } catch (error) {
      const errorResult: PrintResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
      
      toast.error(`Connection test failed: ${errorResult.error}`);
      return errorResult;
    }
  }, [getSavedPrinter]);

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