import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseInventoryRealtimeOptions {
  storeKey: string | null;
  enabled?: boolean;
  onSyncComplete?: (itemId: string, status: 'synced' | 'error') => void;
}

/**
 * Subscribe to real-time updates for inventory items.
 * Updates React Query cache optimistically when sync status changes.
 */
export function useInventoryRealtime({
  storeKey,
  enabled = true,
  onSyncComplete,
}: UseInventoryRealtimeOptions) {
  const queryClient = useQueryClient();
  const lastNotificationRef = useRef<string | null>(null);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Only handle UPDATE events for sync status changes
    if (eventType !== 'UPDATE') return;
    
    const itemId = newRecord?.id;
    if (!itemId) return;

    // Check if this is a sync status change
    const oldSyncStatus = oldRecord?.shopify_sync_status;
    const newSyncStatus = newRecord?.shopify_sync_status;
    const oldEbaySyncStatus = oldRecord?.ebay_sync_status;
    const newEbaySyncStatus = newRecord?.ebay_sync_status;

    const shopifySyncChanged = oldSyncStatus !== newSyncStatus;
    const ebaySyncChanged = oldEbaySyncStatus !== newEbaySyncStatus;

    if (!shopifySyncChanged && !ebaySyncChanged) return;

    // Update the React Query cache optimistically
    queryClient.setQueriesData(
      { queryKey: ['inventory-list'] },
      (oldData: any) => {
        if (!oldData?.pages) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            items: page.items?.map((item: any) => 
              item.id === itemId 
                ? { 
                    ...item, 
                    shopify_sync_status: newRecord.shopify_sync_status,
                    shopify_product_id: newRecord.shopify_product_id,
                    ebay_sync_status: newRecord.ebay_sync_status,
                    ebay_listing_id: newRecord.ebay_listing_id,
                    last_shopify_synced_at: newRecord.last_shopify_synced_at,
                    last_ebay_synced_at: newRecord.last_ebay_synced_at,
                  }
                : item
            ),
          })),
        };
      }
    );

    // Show toast for significant status changes (but debounce to avoid spam)
    const notificationKey = `${itemId}-${newSyncStatus}-${newEbaySyncStatus}`;
    if (lastNotificationRef.current !== notificationKey) {
      lastNotificationRef.current = notificationKey;
      
      if (shopifySyncChanged) {
        if (newSyncStatus === 'synced') {
          onSyncComplete?.(itemId, 'synced');
        } else if (newSyncStatus === 'error') {
          onSyncComplete?.(itemId, 'error');
        }
      }
      
      if (ebaySyncChanged) {
        if (newEbaySyncStatus === 'listed') {
          onSyncComplete?.(itemId, 'synced');
        } else if (newEbaySyncStatus === 'error') {
          onSyncComplete?.(itemId, 'error');
        }
      }
    }
  }, [queryClient, onSyncComplete]);

  useEffect(() => {
    if (!enabled || !storeKey) return;

    const channel = supabase
      .channel(`inventory-realtime-${storeKey}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'intake_items',
          filter: `store_key=eq.${storeKey}`,
        },
        handleRealtimeUpdate
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Inventory Realtime] Subscribed to sync status updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeKey, enabled, handleRealtimeUpdate]);

  return null;
}
