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
      // First get the lots
      const { data: lots, error: lotsError } = await supabase
        .from('intake_lots')
        .select('id, lot_number, created_at, total_items, total_value, status')
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (lotsError) throw lotsError;
      if (!lots || lots.length === 0) return [];

      // Get unprinted counts for each lot
      const lotIds = lots.map(lot => lot.id);
      const { data: itemCounts, error: countsError } = await supabase
        .from('intake_items')
        .select('lot_id')
        .in('lot_id', lotIds)
        .is('deleted_at', null)
        .not('removed_from_batch_at', 'is', null)
        .is('printed_at', null);

      if (countsError) throw countsError;

      // Count items per lot
      const unprintedCounts = (itemCounts || []).reduce((acc, item) => {
        acc[item.lot_id] = (acc[item.lot_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Merge counts with lots
      return lots.map(lot => ({
        ...lot,
        unprinted_count: unprintedCounts[lot.id] || 0,
      }));
    },
    enabled: Boolean(storeKey && locationGid),
    staleTime: 60000, // 1 minute
  });
}
