import { useState, useEffect, useCallback, useRef } from 'react';
import { zebraNetworkService, type ZebraPrinter, type PrinterStatus } from '@/lib/zebraNetworkService';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function useZebraNetwork() {
  const [printers, setPrinters] = useState<ZebraPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<ZebraPrinter | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Get or create consistent workstation ID
  const getWorkstationId = () => {
    let workstationId = localStorage.getItem('workstation-id');
    if (!workstationId) {
      workstationId = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', workstationId);
    }
    return workstationId;
  };

  // Load saved printer selection from database first, then localStorage
  const loadSavedPrinter = useCallback(async () => {
    try {
      // First try to load from database
      const workstationId = getWorkstationId();
      const { data: settings } = await supabase
        .from('printer_settings')
        .select('printer_ip, printer_port, printer_name')
        .eq('workstation_id', workstationId)
        .order('updated_at', { ascending: false })
        .maybeSingle();
      
      if (settings?.printer_ip) {
        const savedPrinter: ZebraPrinter = {
          id: `zebra-${settings.printer_ip}`,
          ip: settings.printer_ip,
          port: settings.printer_port || 9100,
          name: settings.printer_name || `Zebra (${settings.printer_ip})`,
          isDefault: true
        };
        setSelectedPrinter(savedPrinter);
        // Sync to localStorage for consistency
        localStorage.setItem('zebra-selected-printer', JSON.stringify(savedPrinter));
        return;
      }
    } catch (error) {
      console.log('No database printer settings found, checking localStorage');
    }
    
    // Fallback to localStorage if no database setting found
    const saved = localStorage.getItem('zebra-selected-printer');
    if (saved) {
      try {
        const savedPrinter = JSON.parse(saved) as ZebraPrinter;
        setSelectedPrinter(savedPrinter);
      } catch (error) {
        console.error('Failed to parse saved printer:', error);
        localStorage.removeItem('zebra-selected-printer');
      }
    }
  }, []);

  // Save printer selection to both localStorage and database
  const setSelectedPrinterId = useCallback((printer: ZebraPrinter | null) => {
    setSelectedPrinter(printer);
    
    if (printer) {
      localStorage.setItem('zebra-selected-printer', JSON.stringify(printer));
      
      // Also save to database
      const syncToDatabase = async () => {
        try {
          const workstationId = getWorkstationId();
          await supabase
            .from('printer_settings')
            .upsert({
              workstation_id: workstationId,
              printer_ip: printer.ip,
              printer_port: printer.port,
              printer_name: printer.name,
              use_printnode: false, // Mark as network printer
            }, {
              onConflict: 'workstation_id'
            });
        } catch (error) {
          console.log('Could not sync printer setting to database:', JSON.stringify(error, null, 2));
        }
      };
      
      syncToDatabase();
    } else {
      localStorage.removeItem('zebra-selected-printer');
    }
  }, []);

  const refreshPrinters = useCallback(async (showToast = false, networkBase = '192.168.0') => {
    setIsLoading(true);
    setConnectionError('');
    try {
      // Add any manually configured printers from localStorage/database
      const savedPrinters: ZebraPrinter[] = [];
      
      // Load from database
      try {
        const { data: settings } = await supabase
          .from('printer_settings')
          .select('printer_ip, printer_port, printer_name')
          .not('printer_ip', 'is', null);
        
        if (settings) {
          for (const setting of settings) {
            const printer: ZebraPrinter = {
              id: `zebra-${setting.printer_ip}`,
              ip: setting.printer_ip,
              port: setting.printer_port || 9100,
              name: setting.printer_name || `Zebra (${setting.printer_ip})`,
            };
            
            // Test connection (but don't let it fail the whole process)
            try {
              printer.isConnected = await zebraNetworkService.testConnection(printer.ip, printer.port);
            } catch (error) {
              console.log('Connection test failed for', printer.ip, '- marking as unknown status');
              printer.isConnected = undefined; // Unknown status
            }
            savedPrinters.push(printer);
          }
        }
      } catch (error) {
        console.log('Failed to load saved printers from database');
      }

      // Discover new printers
      const discoveredPrinters = await zebraNetworkService.discoverPrinters(networkBase);
      
      // Combine saved and discovered printers (avoid duplicates)
      const allPrinters = [...savedPrinters];
      for (const discovered of discoveredPrinters) {
        if (!allPrinters.some(p => p.ip === discovered.ip)) {
          allPrinters.push(discovered);
        }
      }
      
      setPrinters(allPrinters);
      setIsConnected(allPrinters.length > 0);
      
      if (showToast) {
        toast.success(`Found ${allPrinters.length} Zebra printer(s)`);
      }
    } catch (error) {
      setIsConnected(false);
      setPrinters([]);
      const errorMessage = error instanceof Error ? error.message : "Failed to discover Zebra printers";
      setConnectionError(errorMessage);
      if (showToast) {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount: load saved selection first, then refresh printers
  useEffect(() => {
    (async () => {
      await loadSavedPrinter();
      await refreshPrinters();
    })();
  }, [loadSavedPrinter, refreshPrinters]);

  const printZPL = useCallback(async (zplData: string, options?: { title?: string; copies?: number }) => {
    const result = await print(zplData, options?.copies || 1);
    return result;
  }, []);

  const testConnection = useCallback(async (printer?: ZebraPrinter) => {
    const targetPrinter = printer || selectedPrinter;
    if (!targetPrinter) {
      throw new Error('No printer specified');
    }
    return zebraNetworkService.testConnection(targetPrinter.ip, targetPrinter.port);
  }, [selectedPrinter]);

  const addManualPrinter = useCallback(async (ip: string, port: number = 9100, name?: string) => {
    // Test connection first (but don't let it fail)
    let isConnected;
    try {
      isConnected = await zebraNetworkService.testConnection(ip, port);
    } catch (error) {
      console.log('Connection test failed for new printer - will show as unknown status');
      isConnected = undefined;
    }
    
    const printer: ZebraPrinter = {
      id: `zebra-${ip}`,
      ip,
      port,
      name: name || `Zebra (${ip})`,
      isConnected
    };

    // Add to current list
    setPrinters(prev => {
      const existing = prev.find(p => p.ip === ip && p.port === port);
      if (existing) {
        return prev.map(p => p.id === existing.id ? printer : p);
      }
      return [...prev, printer];
    });

    // Save to database
    try {
      const workstationId = getWorkstationId();
      await supabase
        .from('printer_settings')
        .upsert({
          workstation_id: workstationId,
          printer_ip: ip,
          printer_port: port,
          printer_name: name || `Zebra (${ip})`,
          use_printnode: false,
        }, {
          onConflict: 'workstation_id'
        });
    } catch (error) {
      console.error('Failed to save printer to database:', error);
    }

    return printer;
  }, []);

  // Polling for printer status
  const startStatusPolling = useCallback((printer: ZebraPrinter) => {
    // Clear any existing polling
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
    }

    const pollStatus = async () => {
      try {
        const status = await zebraNetworkService.queryStatus(printer.ip, printer.port);
        setPrinterStatus(prevStatus => {
          // Check for status changes and show notifications
          if (prevStatus && prevStatus.ready !== status.ready) {
            if (!status.ready) {
              const issues = [];
              if (status.paused) issues.push('paused');
              if (status.headOpen) issues.push('head open');
              if (status.mediaOut) issues.push('media out');
              toast.warning(`Printer issue detected: ${issues.join(', ')}`);
            } else {
              toast.success('Printer is now ready');
            }
          }
          return { ...status, lastSeenAt: Date.now() };
        });
      } catch (error) {
        setPrinterStatus(prev => prev ? { ...prev, ready: false, lastSeenAt: Date.now() } : null);
      }
    };

    // Initial status check
    pollStatus();
    
    // Set up polling every 25 seconds
    statusPollingRef.current = setInterval(pollStatus, 25000);
  }, []);

  const stopStatusPolling = useCallback(() => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
      statusPollingRef.current = null;
    }
  }, []);

  // Enhanced setSelectedPrinterId with status polling
  const setSelectedPrinterIdWithPolling = useCallback((printer: ZebraPrinter | null) => {
    // Stop existing polling
    stopStatusPolling();
    setPrinterStatus(null);
    
    // Set the printer
    setSelectedPrinterId(printer);
    
    // Start polling for the new printer
    if (printer) {
      startStatusPolling(printer);
    }
  }, [setSelectedPrinterId, startStatusPolling, stopStatusPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStatusPolling();
    };
  }, [stopStatusPolling]);

  return {
    printers,
    selectedPrinter,
    setSelectedPrinterId: setSelectedPrinterIdWithPolling,
    isConnected,
    isLoading,
    connectionError,
    refreshPrinters,
    printZPL,
    testConnection,
    addManualPrinter,
    printerStatus
  };
}