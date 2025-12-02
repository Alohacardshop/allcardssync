/**
 * Clean Printer Hook - Direct TCP Only
 * Saves printer preferences per user + location
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zebraService, type PrinterStatus, type PrintResult } from '@/lib/printer/zebraService';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
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

export function usePrinter() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { selectedLocation, assignedStore } = useStore();
  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved printer configuration for user + location
  const loadConfig = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      // Try database first (user + location specific)
      let query = supabase
        .from('user_printer_preferences')
        .select('printer_ip, printer_port, printer_name')
        .eq('user_id', user.id)
        .eq('printer_type', 'label');
      
      // Handle null/empty location properly
      if (selectedLocation) {
        query = query.eq('location_gid', selectedLocation);
      } else {
        query = query.or('location_gid.is.null,location_gid.eq.');
      }
      
      const { data } = await query.maybeSingle();

      if (data?.printer_ip) {
        const config = {
          ip: data.printer_ip,
          port: data.printer_port || DEFAULT_PORT,
          name: data.printer_name || `Printer (${data.printer_ip})`
        };
        setPrinter(config);
        // Also cache locally for quick access
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return;
      }

      // Fallback to localStorage if no DB config
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.ip) {
          setPrinter({
            ip: parsed.ip,
            port: parsed.port || DEFAULT_PORT,
            name: parsed.name || `Printer (${parsed.ip})`
          });
        }
      }
    } catch (error) {
      console.log('Failed to load printer config:', error);
      
      // Fallback to localStorage on error
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.ip) {
            setPrinter(parsed);
          }
        }
      } catch {}
    }
  }, [user?.id, selectedLocation]);

  // Save printer configuration for user + location
  const saveConfig = useCallback(async (config: PrinterConfig) => {
    setPrinter(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    if (!user?.id) {
      console.log('No user logged in, saved to localStorage only');
      return;
    }

    // Save to database with user + location
    // Use delete + insert pattern due to functional unique index
    try {
      const locationKey = selectedLocation || '';
      
      // Delete existing preference for this user/type/location
      await supabase
        .from('user_printer_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('printer_type', 'label')
        .eq('location_gid', locationKey || null);
      
      // Insert new preference
      await supabase
        .from('user_printer_preferences')
        .insert({
          user_id: user.id,
          location_gid: selectedLocation || null,
          store_key: assignedStore || null,
          printer_type: 'label',
          printer_ip: config.ip,
          printer_port: config.port,
          printer_name: config.name,
        });
    } catch (error) {
      console.log('Failed to save printer config to database:', error);
    }
    
    queryClient.invalidateQueries({ queryKey: ['printerStatus'] });
  }, [user?.id, selectedLocation, assignedStore, queryClient]);

  // Printer status polling with React Query
  const { data: status } = useQuery<PrinterStatus | null>({
    queryKey: ['printerStatus', printer?.ip],
    queryFn: async () => {
      if (!printer?.ip) return null;
      return zebraService.queryStatus(printer.ip, printer.port);
    },
    enabled: !!printer?.ip,
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

  // Load config when user or location changes
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
          name: parsed.name || `Printer (${parsed.ip})`
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
