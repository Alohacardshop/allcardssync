import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePrinterDiscovery(enabled: boolean = false) {
  return useQuery({
    queryKey: ['printer-discovery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('printer_settings')
        .select('printer_ip, printer_port, printer_name')
        .not('printer_ip', 'is', null);

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
    enabled, // Only run when explicitly enabled
  });
}
