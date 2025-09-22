/**
 * Simple Printing Hook
 * Direct, immediate printing without queues or complex state
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { printZPLDirect, testPrinterConnection, DEFAULT_ZD410_PRINTER, type PrinterConnection, type PrintResult } from '@/lib/directLocalPrint';
import { printViaLocalBridge, testLocalBridge, DEFAULT_BRIDGE_CONFIG, type LocalBridgeConfig } from '@/lib/localPrintBridge';
import { printNodeService } from '@/lib/printNodeService';

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

  // Print ZPL with PrintNode only
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    console.log('🖨️ Starting PrintNode print process...', { copies, zplLength: zpl.length });
    setPrintState(prev => ({ ...prev, isLoading: true }));
    
    const printer = getSavedPrinter();
    console.log('🖨️ Using printer:', printer);
    
    try {
      // Check if PrintNode is configured
      if (!printer.usePrintNode || !printer.printNodeId) {
        throw new Error('No PrintNode printer configured. Please configure printing in Test Hardware > Printer Setup.');
      }
      
      toast.info(`Sending ${copies} label(s) to PrintNode...`);
      
      console.log('🖨️ Attempting PrintNode print...');
      const printNodeResult = await printNodeService.printZPL(zpl, printer.printNodeId, copies);
      console.log('🖨️ PrintNode result:', printNodeResult);
      
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