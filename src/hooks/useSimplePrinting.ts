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
          userintNode: parsed.userintNode || false
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

  // Print ZPL with PrintNode or fallback to direct/bridge
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    console.log('🖨️ Starting print process...', { copies, zplLength: zpl.length });
    setPrintState(prev => ({ ...prev, isLoading: true }));
    
    const printer = getSavedPrinter();
    console.log('🖨️ Using printer:', printer);
    
    try {
      toast.info(`Sending ${copies} label(s) to ${printer.name || printer.ip}...`);
      
      // Try PrintNode first if configured
      if (printer.userintNode && printer.printNodeId) {
        console.log('🖨️ Attempting PrintNode print...');
        const printNodeResult = await printNodeService.printZPL(zpl, printer.printNodeId, copies);
        console.log('🖨️ PrintNode result:', printNodeResult);
        
        if (printNodeResult.success) {
          const result: PrintResult = { success: true };
          setPrintState({
            isLoading: false,
            lastResult: result
          });
          toast.success(`Successfully sent ${copies} label(s) to PrintNode`);
          return result;
        } else {
          toast.warning('PrintNode failed, trying direct printing...');
        }
      }
      
      // Fallback to direct HTTP
      console.log('🖨️ Attempting direct HTTP print...');
      let result = await printZPLDirect(zpl, printer, copies);
      console.log('🖨️ Direct HTTP result:', result);
      
      // If direct fails due to CORS, try local bridge
      if (!result.success && (result.error?.includes('CORS') || result.error?.includes('Failed to fetch'))) {
        console.log('🖨️ Direct failed, trying local bridge...');
        toast.info('Direct printing blocked, trying local bridge...');
        
        const bridgeConfig: LocalBridgeConfig = {
          ...DEFAULT_BRIDGE_CONFIG,
          printerIp: printer.ip,
          printerPort: printer.port
        };
        
        const bridgeResult = await printViaLocalBridge(zpl, bridgeConfig, copies);
        console.log('🖨️ Bridge result:', bridgeResult);
        result = bridgeResult;
      }
      
      setPrintState({
        isLoading: false,
        lastResult: result
      });
      
      if (result.success) {
        toast.success(`Print sent successfully!`);
      } else {
        toast.error(`Print failed: ${result.error}`);
        
        // Offer troubleshooting based on error type
        setTimeout(() => {
          if (result.error?.includes('Bridge not running')) {
            toast.info('Local Print Bridge needed:', {
              description: 'Run: cd local-print-bridge && npm install && npm start',
              duration: 15000,
              action: {
                label: 'Open Printer Web UI',
                onClick: () => window.open(`http://${printer.ip}`, '_blank')
              }
            });
          } else {
            toast.info('Troubleshooting:', {
              description: 'Check: 1) Printer power 2) Network connection 3) Same WiFi network',
              duration: 10000,
              action: {
                label: 'Open Printer Web UI',
                onClick: () => window.open(`http://${printer.ip}`, '_blank')
              }
            });
          }
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