import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLogger } from '@/hooks/useLogger';
import { queryKeys } from './useAddIntakeItem';

interface CurrentBatchParams {
  storeKey?: string | null;
  locationGid?: string | null;
  userId?: string;
}

interface BatchItem {
  id: string;
  lot_id: string;
  lot_number: string;
  created_at: string;
  quantity: number;
  price: number;
  [key: string]: any;
}

interface CurrentBatchData {
  items: BatchItem[];
  counts: {
    activeItems: number;
    totalItems: number;
  };
}

export const useCurrentBatch = ({ storeKey, locationGid, userId }: CurrentBatchParams) => {
  const logger = useLogger('useCurrentBatch');

  const fetchBatchItems = async (): Promise<CurrentBatchData> => {
    if (!storeKey || !locationGid || !userId) {
      logger.logDebug('Missing context for batch fetch', { storeKey, locationGid, userId });
      return { items: [], counts: { activeItems: 0, totalItems: 0 } };
    }

    logger.logDebug('Fetching current batch', { storeKey, locationGid });

    // Get active lot
    const { data: lot, error: lotError } = await supabase
      .from('intake_lots')
      .select('*')
      .eq('status', 'active')
      .eq('store_key', storeKey)
      .eq('shopify_location_gid', locationGid)
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lotError) {
      logger.logError('Failed to fetch active lot', lotError);
      throw lotError;
    }

    if (!lot) {
      logger.logDebug('No active lot found');
      return { items: [], counts: { activeItems: 0, totalItems: 0 } };
    }

    logger.logInfo('Active lot found', { lotId: lot.id, lotNumber: lot.lot_number });

    // Get items from lot
    const { data: items, error: itemsError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('lot_id', lot.id)
      .is('deleted_at', null)
      .is('removed_from_batch_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (itemsError) {
      logger.logError('Failed to fetch batch items', itemsError);
      throw itemsError;
    }

    logger.logInfo('Batch items fetched', { count: items?.length || 0 });

    return {
      items: items || [],
      counts: {
        activeItems: items?.length || 0,
        totalItems: lot.total_items || 0,
      },
    };
  };

  return useQuery<CurrentBatchData, Error>({
    queryKey: queryKeys.currentBatch(storeKey, locationGid),
    queryFn: fetchBatchItems,
    enabled: Boolean(storeKey && locationGid && userId),
    staleTime: 60_000, // Data is fresh for 1 minute
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
};
