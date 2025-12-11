/**
 * React hook for QZ Tray integration
 * Provides connection management, printer discovery, and printing capabilities
 */

import { useState, useCallback, useEffect } from 'react';
import {
  connectQzTray,
  disconnectQzTray,
  isConnected as checkIsConnected,
  listPrinters,
  findZebraPrinters,
  printZpl as sendPrintZpl,
  getDefaultPrinter,
} from '@/lib/qzTray';

const STORAGE_KEY = 'qz-tray-auto-connect';
const SELECTED_PRINTER_KEY = 'qz-tray-selected-printer';

export interface UseQzTrayResult {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // Printers
  printers: string[];
  zebraPrinters: string[];
  defaultPrinter: string | null;
  selectedPrinter: string | null;
  setSelectedPrinter: (printer: string | null) => void;
  refreshPrinters: () => Promise<void>;
  isLoadingPrinters: boolean;

  // Printing
  printZpl: (printerName: string, zpl: string) => Promise<void>;
  isPrinting: boolean;
  printError: string | null;
  clearPrintError: () => void;
}

export function useQzTray(): UseQzTrayResult {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Printer state
  const [printers, setPrinters] = useState<string[]>([]);
  const [zebraPrinters, setZebraPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [selectedPrinter, setSelectedPrinterState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_PRINTER_KEY);
    } catch {
      return null;
    }
  });
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);

  // Print state
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Persist selected printer
  const setSelectedPrinter = useCallback((printer: string | null) => {
    setSelectedPrinterState(printer);
    try {
      if (printer) {
        localStorage.setItem(SELECTED_PRINTER_KEY, printer);
      } else {
        localStorage.removeItem(SELECTED_PRINTER_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Connect to QZ Tray
  const connect = useCallback(async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    setConnectionError(null);

    try {
      await connectQzTray();
      setIsConnected(true);
      
      // Save auto-connect preference
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Ignore storage errors
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnectionError(message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  // Disconnect from QZ Tray
  const disconnect = useCallback(async () => {
    try {
      await disconnectQzTray();
      setIsConnected(false);
      setPrinters([]);
      setZebraPrinters([]);
      setDefaultPrinter(null);
      
      // Clear auto-connect preference
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    } catch (error) {
      console.error('[useQzTray] Disconnect error:', error);
    }
  }, []);

  // Refresh printer list
  const refreshPrinters = useCallback(async () => {
    if (!isConnected) return;

    setIsLoadingPrinters(true);

    try {
      const [allPrinters, zebras, defaultP] = await Promise.all([
        listPrinters(),
        findZebraPrinters(),
        getDefaultPrinter().catch(() => null),
      ]);

      setPrinters(allPrinters);
      setZebraPrinters(zebras);
      setDefaultPrinter(defaultP);
    } catch (error) {
      console.error('[useQzTray] Error refreshing printers:', error);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, [isConnected]);

  // Print ZPL
  const printZpl = useCallback(async (printerName: string, zpl: string) => {
    if (!isConnected) {
      throw new Error('Not connected to QZ Tray');
    }

    setIsPrinting(true);
    setPrintError(null);

    try {
      await sendPrintZpl(printerName, zpl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed';
      setPrintError(message);
      throw error;
    } finally {
      setIsPrinting(false);
    }
  }, [isConnected]);

  // Clear print error
  const clearPrintError = useCallback(() => {
    setPrintError(null);
  }, []);

  // Check connection status periodically and auto-connect if enabled
  useEffect(() => {
    const checkConnection = () => {
      const connected = checkIsConnected();
      setIsConnected(connected);
    };

    // Initial check
    checkConnection();

    // Auto-connect if previously connected
    const shouldAutoConnect = localStorage.getItem(STORAGE_KEY) === 'true';
    if (shouldAutoConnect && !checkIsConnected()) {
      connect();
    }

    // Periodic check
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, [connect]);

  // Refresh printers when connected
  useEffect(() => {
    if (isConnected) {
      refreshPrinters();
    }
  }, [isConnected, refreshPrinters]);

  return {
    // Connection
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect,

    // Printers
    printers,
    zebraPrinters,
    defaultPrinter,
    selectedPrinter,
    setSelectedPrinter,
    refreshPrinters,
    isLoadingPrinters,

    // Printing
    printZpl,
    isPrinting,
    printError,
    clearPrintError,
  };
}
