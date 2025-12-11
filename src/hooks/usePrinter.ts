/**
 * Clean Printer Hook - QZ Tray Integration
 * Saves printer preferences per user + location
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zebraService, type PrinterStatus, type PrintResult } from '@/lib/printer/zebraService';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/integrations/supabase/client';

export type { PrinterStatus, PrintResult };
export type PrintJobResult = PrintResult;

export interface PrinterConfig {
  name: string;
  ip?: string;
  port?: number;
}

const STORAGE_KEY = 'zebra-printer-config';

export function usePrinter() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { selectedLocation, assignedStore } = useStore();
  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      let query = supabase
        .from('user_printer_preferences')
        .select('printer_ip, printer_port, printer_name')
        .eq('user_id', user.id)
        .eq('printer_type', 'label');
      
      if (selectedLocation) {
        query = query.eq('location_gid', selectedLocation);
      } else {
        query = query.or('location_gid.is.null,location_gid.eq.');
      }
      
      const { data } = await query.maybeSingle();

      if (data?.printer_name) {
        const config = {
          name: data.printer_name,
          ip: data.printer_ip || undefined,
          port: data.printer_port || undefined,
        };
        setPrinter(config);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return;
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) {
          setPrinter(parsed);
        }
      }
    } catch (error) {
      console.log('Failed to load printer config:', error);
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setPrinter(JSON.parse(saved));
        }
      } catch {}
    }
  }, [user?.id, selectedLocation]);

  const saveConfig = useCallback(async (config: PrinterConfig) => {
    setPrinter(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    if (!user?.id) return;

    try {
      await supabase
        .from('user_printer_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('printer_type', 'label');
      
      await supabase
        .from('user_printer_preferences')
        .insert({
          user_id: user.id,
          location_gid: selectedLocation || null,
          store_key: assignedStore || null,
          printer_type: 'label',
          printer_ip: config.ip || null,
          printer_port: config.port || 9100,
          printer_name: config.name,
        });
    } catch (error) {
      console.log('Failed to save printer config:', error);
    }
    
    queryClient.invalidateQueries({ queryKey: ['printerStatus'] });
  }, [user?.id, selectedLocation, assignedStore, queryClient]);

  const { data: status } = useQuery<PrinterStatus | null>({
    queryKey: ['printerStatus', printer?.name],
    queryFn: async () => {
      if (!printer?.name) return null;
      return zebraService.queryStatus();
    },
    enabled: !!printer?.name,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const testConnection = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      return await zebraService.testConnection();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<PrinterStatus | null> => {
    if (!printer) return null;
    try {
      const printerStatus = await zebraService.queryStatus();
      queryClient.setQueryData(['printerStatus', printer.name], printerStatus);
      return printerStatus;
    } catch {
      return null;
    }
  }, [printer, queryClient]);

  const print = useCallback(async (zpl: string, copies: number = 1): Promise<PrintResult> => {
    if (!printer?.name) {
      return { success: false, error: 'No printer configured' };
    }
    
    setIsLoading(true);
    try {
      let finalZpl = zpl;
      if (copies > 1 && !zpl.includes('^PQ')) {
        finalZpl = zpl.replace(/\^XZ\s*$/, `^PQ${copies}\n^XZ`);
      }
      return await zebraService.print(finalZpl, printer.name);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Print failed' };
    } finally {
      setIsLoading(false);
    }
  }, [printer]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
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

export async function getDirectPrinterConfig(): Promise<PrinterConfig | null> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return null;
  } catch {
    return null;
  }
}
