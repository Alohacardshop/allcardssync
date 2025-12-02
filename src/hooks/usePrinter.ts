/**
 * Clean Printer Hook - Direct TCP Only
 * Single hook for all printer operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { zebraService, type PrinterStatus, type PrintResult, type DiscoveryOptions } from '@/lib/printer/zebraService';
import { supabase } from '@/integrations/supabase/client';

export type { PrinterStatus, PrintResult };
export type PrintJobResult = PrintResult; // Alias for backwards compatibility

export interface PrinterConfig {
  ip: string;
  port: number;
  name: string;
}

const STORAGE_KEY = 'zebra-printer-config';
const DEFAULT_PORT = 9100;

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
  const queryClient = useQueryClient();
  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved printer configuration
  const loadConfig = useCallback(async () => {
    try {
      // Try localStorage first
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.ip) {
          setPrinter({
            ip: parsed.ip,
            port: parsed.port || DEFAULT_PORT,
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
          port: data.printer_port || DEFAULT_PORT,
          name: data.printer_name || `Zebra (${data.printer_ip})`
        };
        setPrinter(config);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      }
    } catch (error) {
      console.log('Failed to load printer config:', error);
    }
  }, []);

  // Save printer configuration
  const saveConfig = useCallback(async (config: PrinterConfig) => {
    setPrinter(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

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
    
    queryClient.invalidateQueries({ queryKey: ['printerStatus'] });
  }, [queryClient]);

  // Printer status polling with React Query
  const { data: status } = useQuery<PrinterStatus | null>({
    queryKey: ['printerStatus', printer?.ip],
    queryFn: async () => {
      if (!printer) return null;
      return zebraService.queryStatus(printer.ip, printer.port);
    },
    enabled: !!printer,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // Poll more frequently if issues detected
      return (!data.ready || data.paused || data.mediaOut || data.headOpen) ? 10000 : 30000;
    },
    staleTime: 20000,
  });

  // Test connection
  const testConnection = useCallback(async (ip?: string, port?: number): Promise<boolean> => {
    setIsLoading(true);
    try {
      const testIp = ip || printer?.ip;
      const testPort = port || printer?.port || DEFAULT_PORT;
      if (!testIp) return false;
      
      const connected = await zebraService.testConnection(testIp, testPort);
      return connected;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [printer?.ip, printer?.port]);

  // Get printer status
  const refreshStatus = useCallback(async (): Promise<PrinterStatus | null> => {
    if (!printer) return null;
    
    try {
      const printerStatus = await zebraService.queryStatus(printer.ip, printer.port);
      queryClient.setQueryData(['printerStatus', printer.ip], printerStatus);
      return printerStatus;
    } catch (error) {
      return null;
    }
  }, [printer, queryClient]);

  // Print ZPL directly
  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    if (!printer) {
      return { success: false, error: 'No printer configured' };
    }
    
    setIsLoading(true);
    try {
      // Handle copies using ^PQ if not present
      let finalZpl = zpl;
      if (copies > 1 && !zpl.includes('^PQ')) {
        finalZpl = zpl.replace(/\^XZ\s*$/, `^PQ${copies}\n^XZ`);
      }
      
      const result = await zebraService.print(finalZpl, printer.ip, printer.port);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print failed'
      };
    } finally {
      setIsLoading(false);
    }
  }, [printer]);

  // Discover printers on network
  const discoverPrinters = useCallback(async (options?: DiscoveryOptions | string): Promise<PrinterConfig[]> => {
    setIsLoading(true);
    try {
      return await zebraService.discoverPrinters(options);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    // Use 'config' alias for consistency, but keep 'printer' for backwards compat
    config: printer,
    printer,
    status,
    isLoading,
    isConnected: !!printer && !!status?.ready,
    saveConfig,
    testConnection,
    refreshStatus,
    print,
    discoverPrinters,
  };
}

// Export for use in queue instance and other places
export async function getDirectPrinterConfig(): Promise<PrinterConfig | null> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.ip) {
        return {
          ip: parsed.ip,
          port: parsed.port || DEFAULT_PORT,
          name: parsed.name || `Zebra (${parsed.ip})`
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Sync helper function
export function getWorkstationIdSync(): string {
  return getWorkstationId();
}
