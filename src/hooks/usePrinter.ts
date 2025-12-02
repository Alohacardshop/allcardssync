/**
 * Simple Printer Hook
 * Direct TCP printing via zebra-tcp edge function
 */

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { zebraNetworkService, type ZebraPrinter, type PrinterStatus, type PrintJobResult } from '@/lib/zebraNetworkService';
import { supabase } from '@/integrations/supabase/client';

export interface PrinterConfig {
  ip: string;
  port: number;
  name: string;
}

const DEFAULT_PRINTER: PrinterConfig = {
  ip: '192.168.1.70',
  port: 9100,
  name: 'Zebra ZD410'
};

// Get or create consistent workstation ID
function getWorkstationId(): string {
  let workstationId = localStorage.getItem('workstation-id');
  if (!workstationId) {
    workstationId = crypto.randomUUID().substring(0, 8);
    localStorage.setItem('workstation-id', workstationId);
  }
  return workstationId;
}

export function usePrinter() {
  const [printer, setPrinter] = useState<PrinterConfig>(DEFAULT_PRINTER);
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Load saved printer configuration
  const loadConfig = useCallback(async () => {
    try {
      // Try localStorage first
      const saved = localStorage.getItem('zebra-printer-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.ip) {
          setPrinter({
            ip: parsed.ip,
            port: parsed.port || 9100,
            name: parsed.name || `Zebra (${parsed.ip})`
          });
          return;
        }
      }

      // Try database
      const workstationId = getWorkstationId();
      const { data } = await supabase
        .from('printer_settings')
        .select('printer_ip, printer_port, printer_name')
        .eq('workstation_id', workstationId)
        .maybeSingle();

      if (data?.printer_ip) {
        const config = {
          ip: data.printer_ip,
          port: data.printer_port || 9100,
          name: data.printer_name || `Zebra (${data.printer_ip})`
        };
        setPrinter(config);
        localStorage.setItem('zebra-printer-config', JSON.stringify(config));
      }
    } catch (error) {
      console.log('Failed to load printer config:', error);
    }
  }, []);

  // Save printer configuration
  const saveConfig = useCallback(async (config: PrinterConfig) => {
    setPrinter(config);
    localStorage.setItem('zebra-printer-config', JSON.stringify(config));

    // Also save to database
    try {
      const workstationId = getWorkstationId();
      await supabase
        .from('printer_settings')
        .upsert({
          workstation_id: workstationId,
          printer_ip: config.ip,
          printer_port: config.port,
          printer_name: config.name,
          use_printnode: false,
        }, { onConflict: 'workstation_id' });
    } catch (error) {
      console.log('Failed to save printer config to database:', error);
    }
  }, []);

  // Test connection
  const testConnection = useCallback(async (ip?: string, port?: number): Promise<boolean> => {
    setIsLoading(true);
    try {
      const testIp = ip || printer.ip;
      const testPort = port || printer.port;
      const connected = await zebraNetworkService.testConnection(testIp, testPort);
      setIsConnected(connected);
      return connected;
    } catch (error) {
      setIsConnected(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [printer.ip, printer.port]);

  // Get printer status
  const refreshStatus = useCallback(async () => {
    try {
      const printerStatus = await zebraNetworkService.queryStatus(printer.ip, printer.port);
      setStatus(printerStatus);
      setIsConnected(printerStatus.ready !== undefined);
      return printerStatus;
    } catch (error) {
      setStatus(null);
      setIsConnected(false);
      return null;
    }
  }, [printer.ip, printer.port]);

  // Print ZPL directly
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintJobResult> => {
    setIsLoading(true);
    try {
      const result = await zebraNetworkService.printZPLDirect(zpl, printer.ip, printer.port);
      
      if (result.success) {
        // Handle multiple copies by sending multiple times if needed
        if (copies > 1) {
          for (let i = 1; i < copies; i++) {
            await zebraNetworkService.printZPLDirect(zpl, printer.ip, printer.port);
          }
        }
        return result;
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print failed'
      };
    } finally {
      setIsLoading(false);
    }
  }, [printer.ip, printer.port]);

  // Discover printers on network
  const discoverPrinters = useCallback(async (networkBase: string = '192.168.1'): Promise<ZebraPrinter[]> => {
    setIsLoading(true);
    try {
      return await zebraNetworkService.discoverPrinters(networkBase);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    printer,
    status,
    isLoading,
    isConnected,
    saveConfig,
    testConnection,
    refreshStatus,
    print,
    discoverPrinters,
  };
}

// Export for use in queue instance
export async function getDirectPrinterConfig(): Promise<PrinterConfig | null> {
  try {
    const saved = localStorage.getItem('zebra-printer-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.ip) {
        return {
          ip: parsed.ip,
          port: parsed.port || 9100,
          name: parsed.name || `Zebra (${parsed.ip})`
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
