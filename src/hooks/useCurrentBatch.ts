import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLogger } from '@/hooks/useLogger';
import { queryKeys } from '@/lib/queryKeys';

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

    logger.logDebug('Fetching current batch', { storeKey, locationGid, userId });

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

    let lotItems: BatchItem[] = [];
    let activeLot = lot;

    if (lot) {
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

      lotItems = items || [];
    }

    // Also fetch recent orphaned items (created in last 24h without lot_id)
    // This catches items that may have been created before lot assignment was fixed
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: orphanedItems, error: orphanError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('store_key', storeKey)
      .eq('shopify_location_gid', locationGid)
      .eq('created_by', userId)
      .is('lot_id', null)
      .is('deleted_at', null)
      .is('removed_from_batch_at', null)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    if (orphanError) {
      logger.logWarn('Failed to fetch orphaned items', orphanError);
      // Don't throw - this is a fallback, not critical
    }

    // Combine lot items with orphaned items, removing duplicates
    const allItems = [...lotItems];
    const existingIds = new Set(lotItems.map(item => item.id));
    
    if (orphanedItems) {
      for (const item of orphanedItems) {
        if (!existingIds.has(item.id)) {
          allItems.push(item as BatchItem);
        }
      }
    }

    // Sort by created_at descending
    allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const activeCount = allItems.length;
    const totalFromLot = activeLot?.total_items || 0;

    logger.logInfo('Batch items fetched', { 
      lotItems: lotItems.length, 
      orphanedItems: orphanedItems?.length || 0,
      totalActive: activeCount 
    });

    return {
      items: allItems.slice(0, 20), // Limit to 20 items
      counts: {
        activeItems: activeCount,
        totalItems: Math.max(totalFromLot, activeCount),
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
