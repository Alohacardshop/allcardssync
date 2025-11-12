import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseBatchesListProps {
  storeKey: string;
  locationGid: string;
}

export function useBatchesList({ storeKey, locationGid }: UseBatchesListProps) {
  return useQuery({
    queryKey: ['batches-list', storeKey, locationGid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_lots')
        .select('id, lot_number, created_at, total_items, total_value, status')
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(storeKey && locationGid),
    staleTime: 60000, // 1 minute
  });
}
