import { useQuery } from '@tanstack/react-query';
import { queryStatus } from '@/lib/zebraNetworkService';

export interface ZebraPrinter {
  id: string;
  ip: string;
  port: number;
  name: string;
}

export interface PrinterStatus {
  ready: boolean;
  paused: boolean;
  mediaOut: boolean;
  headOpen: boolean;
  ipAddr?: string;
  ssid?: string;
  raw: string;
  lastSeenAt: number;
}

interface UseZebraPrinterStatusOptions {
  printer: ZebraPrinter | null;
  enabled?: boolean;
}

export function useZebraPrinterStatus({ printer, enabled = true }: UseZebraPrinterStatusOptions) {
  return useQuery<PrinterStatus | null>({
    queryKey: ['zebraPrinterStatus', printer?.id],
    queryFn: async () => {
      if (!printer) return null;
      
      try {
        const status = await queryStatus(printer.ip, printer.port);
        return { ...status, lastSeenAt: Date.now() };
      } catch (error) {
        // Return degraded status on error
        return {
          ready: false,
          paused: false,
          mediaOut: false,
          headOpen: false,
          ipAddr: printer.ip,
          ssid: undefined,
          raw: '',
          lastSeenAt: Date.now()
        };
      }
    },
    enabled: enabled && !!printer,
    // Only poll if printer has issues or every 25 seconds
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return false;
      
      // Poll more frequently if there are issues
      if (!status.ready || status.paused || status.mediaOut || status.headOpen) {
        return 10000; // 10 seconds
      }
      
      // Otherwise poll every 25 seconds
      return 25000;
    },
    refetchOnWindowFocus: true,
    staleTime: 20000, // Consider data stale after 20 seconds
  });
}

