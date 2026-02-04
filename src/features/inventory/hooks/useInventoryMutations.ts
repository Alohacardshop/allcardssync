import { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { navigateTo, routes } from '@/lib/navigation';
import type { InventoryListItem } from '../types';

// Action types for tracking per-item state
export type ActionType = 'sync' | 'retry' | 'resync' | 'remove' | 'delete';

// Per-item action state
export interface ItemActionState {
  isLoading: boolean;
  action: ActionType | null;
}

// Bulk action state
export interface BulkActionState {
  isLoading: boolean;
  action: 'bulkSync' | 'bulkResync' | 'bulkRetry' | 'bulkDelete' | null;
  pendingItemIds: Set<string>;
}

interface UseInventoryMutationsOptions {
  selectedLocation: string | null;
  isAdmin: boolean;
  onSuccess?: () => void;
  clearSelection?: () => void;
}

// Helper to create optimistic update for inventory list
function createOptimisticUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  itemIds: string[],
  updateFn: (item: InventoryListItem) => Partial<InventoryListItem>
) {
  queryClient.cancelQueries({ queryKey: ['inventory-list'] });
  const previousData = queryClient.getQueryData(['inventory-list']);
  
  queryClient.setQueryData(
    ['inventory-list'], 
    (old: { pages: { items: InventoryListItem[] }[] } | undefined) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => 
            itemIds.includes(item.id) ? { ...item, ...updateFn(item) } : item
          )
        }))
      };
    }
  );
  
  return previousData;
}

export function useInventoryMutations({
  selectedLocation,
  isAdmin,
  onSuccess,
  clearSelection,
}: UseInventoryMutationsOptions) {
  const queryClient = useQueryClient();

  // ============ SINGLE ITEM MUTATIONS ============

  // Sync single item to Shopify
  const syncMutation = useMutation({
    mutationKey: ['inventory-sync'],
    mutationFn: async (item: InventoryListItem) => {
      if (!selectedLocation) {
        throw new Error('Pick a location first');
      }

      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'update'
      });

      if (queueError) {
        throw new Error(`Failed to queue for sync: ${queueError.message}`);
      }

      await supabase.functions.invoke('shopify-sync', { body: {} });
      return item;
    },
    onSuccess: (item) => {
      toast.success(`${item.sku} queued for Shopify sync`, {
        action: {
          label: 'View Queue',
          onClick: () => navigateTo(routes.adminQueue)
        }
      });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to queue sync');
    },
  });

  // Retry sync for failed item
  const retrySyncMutation = useMutation({
    mutationKey: ['inventory-retry-sync'],
    mutationFn: async (item: InventoryListItem) => {
      if (!item.store_key || !item.shopify_location_gid) {
        throw new Error('Item is missing store or location data - cannot retry');
      }

      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'create'
      });

      if (queueError) {
        throw new Error(`Failed to queue for retry: ${queueError.message}`);
      }

      await supabase.functions.invoke('shopify-sync', { body: {} });
      return item;
    },
    onSuccess: (item) => {
      toast.success(`${item.sku} queued for retry`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to retry sync: ' + error.message);
    },
  });

  // Resync existing Shopify product
  const resyncMutation = useMutation({
    mutationKey: ['inventory-resync'],
    mutationFn: async (item: InventoryListItem) => {
      if (!item.store_key || !item.shopify_location_gid) {
        throw new Error('Item is missing store or location data');
      }
      
      if (!item.shopify_product_id) {
        throw new Error('Item has no Shopify product ID - use "Sync" instead');
      }

      if (item.type?.toLowerCase() === 'graded' || item.psa_cert) {
        const result = await sendGradedToShopify({
          storeKey: item.store_key as 'hawaii' | 'las_vegas',
          locationGid: item.shopify_location_gid,
          vendor: item.vendor ?? undefined,
          item: {
            id: item.id,
            sku: item.sku || '',
            psa_cert: item.psa_cert,
            barcode: item.sku,
            title: item.subject || '',
            price: item.price,
            grade: item.grade,
            quantity: item.quantity,
            year: item.year,
            brand_title: item.brand_title,
            subject: item.subject,
            card_number: typeof item.card_number === 'number' ? String(item.card_number) : item.card_number
          }
        });

        if (!result?.success) {
          throw new Error('Resync failed');
        }
      } else {
        const result = await sendRawToShopify({
          item_id: item.id,
          storeKey: item.store_key as 'hawaii' | 'las_vegas',
          locationGid: item.shopify_location_gid,
          vendor: item.vendor ?? undefined
        });

        if (!result?.success) {
          throw new Error('Resync failed');
        }
      }

      return item;
    },
    onSuccess: (item) => {
      toast.success(`${item.sku} resynced to Shopify with barcode`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error, item) => {
      logger.error('Resync failed', error, { itemId: item.id, sku: item.sku });
      toast.error('Failed to resync: ' + error.message);
    },
  });

  // Remove item from Shopify
  const removeMutation = useMutation({
    mutationKey: ['inventory-remove'],
    mutationFn: async (items: InventoryListItem | InventoryListItem[]) => {
      const itemArray = Array.isArray(items) ? items : [items];
      
      const results = await Promise.allSettled(
        itemArray.map(async (item) => {
          const itemType = item.type || (item.psa_cert || item.grade ? 'Graded' : 'Raw');
          const functionName = itemType === 'Graded' ? 'v2-shopify-remove-graded' : 'v2-shopify-remove-raw';
          
          const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
              storeKey: item.store_key,
              productId: item.shopify_product_id,
              sku: item.sku,
              locationGid: item.shopify_location_gid,
              itemId: item.id,
              certNumber: item.psa_cert,
              quantity: 1
            }
          });

          if (error) {
            throw new Error(`Failed to remove ${item.sku}: ${error.message}`);
          }

          if (!data?.ok) {
            throw new Error(`Failed to remove ${item.sku}: ${data?.error || 'Unknown error'}`);
          }

          await supabase
            .from('intake_items')
            .update({ 
              deleted_at: new Date().toISOString(),
              deleted_reason: 'Removed from Shopify via inventory management',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          return item;
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      return { successful, failed, items: itemArray };
    },
    onSuccess: ({ successful, failed }) => {
      if (successful > 0) {
        toast.success(`Successfully removed ${successful} item${successful > 1 ? 's' : ''} from Shopify`);
      }
      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(`Failed to remove ${failed.length} item${failed.length > 1 ? 's' : ''}: ${firstError.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove items: ${error.message}`);
    },
  });

  // Delete items (with optional Shopify removal)
  const deleteMutation = useMutation({
    mutationKey: ['inventory-delete'],
    mutationFn: async (items: InventoryListItem[]) => {
      if (!isAdmin) {
        throw new Error('Only admins can delete inventory items');
      }

      const itemIds = items.map(item => item.id);
      const previousData = createOptimisticUpdate(queryClient, itemIds, () => ({ 
        deleted_at: new Date().toISOString(),
        deleted_reason: 'Admin deleted'
      }));

      try {
        const results = await Promise.allSettled(
          items.map(async (item) => {
            const isSyncedToShopify = item.shopify_product_id && 
                                      item.shopify_sync_status === 'synced';

            if (isSyncedToShopify) {
              const itemType = item.type || (item.psa_cert || item.grade ? 'Graded' : 'Raw');
              const functionName = itemType === 'Graded' ? 'v2-shopify-remove-graded' : 'v2-shopify-remove-raw';
              
              const { data, error } = await supabase.functions.invoke(functionName, {
                body: {
                  storeKey: item.store_key,
                  productId: item.shopify_product_id,
                  sku: item.sku,
                  locationGid: item.shopify_location_gid,
                  itemId: item.id,
                  certNumber: item.psa_cert,
                  quantity: 1
                }
              });

              if (error) {
                throw new Error(`Failed to remove ${item.sku} from Shopify: ${error.message}`);
              }

              if (!data?.ok) {
                throw new Error(`Failed to remove ${item.sku} from Shopify: ${data?.error || 'Unknown error'}`);
              }
            }

            const { error: deleteError } = await supabase
              .from('intake_items')
              .update({ 
                deleted_at: new Date().toISOString(),
                deleted_reason: isSyncedToShopify 
                  ? 'Admin deleted - removed from Shopify and inventory'
                  : 'Admin deleted from inventory',
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);

            if (deleteError) {
              throw new Error(`Failed to delete ${item.sku} from inventory: ${deleteError.message}`);
            }

            return { item, removedFromShopify: isSyncedToShopify };
          })
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');
        const shopifyRemoved = results
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<{ item: InventoryListItem; removedFromShopify: boolean }>).value)
          .filter(r => r.removedFromShopify).length;

        return { successful, failed, shopifyRemoved, itemIds, previousData };
      } catch (error) {
        // Rollback on error
        if (previousData) {
          queryClient.setQueryData(['inventory-list'], previousData);
        }
        throw error;
      }
    },
    onSuccess: ({ successful, failed, shopifyRemoved, itemIds }) => {
      if (successful > 0) {
        const message = shopifyRemoved > 0 
          ? `Deleted ${successful} item${successful > 1 ? 's' : ''} (${shopifyRemoved} from Shopify)`
          : `Deleted ${successful} item${successful > 1 ? 's' : ''}`;
        
        toast.success(message, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const { error } = await supabase
                  .from('intake_items')
                  .update({ 
                    deleted_at: null, 
                    deleted_reason: null,
                    updated_at: new Date().toISOString()
                  })
                  .in('id', itemIds);
                
                if (error) throw error;
                
                toast.success('Items restored');
                queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                toast.error('Failed to restore items: ' + errorMessage);
              }
            },
          },
          duration: 8000,
        });
      }

      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(`Failed to delete ${failed.length} item${failed.length > 1 ? 's' : ''}: ${firstError.message}`);
      }

      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      clearSelection?.();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete items: ${error.message}`);
    },
  });

  // ============ BULK MUTATIONS ============

  // Bulk sync selected items
  const bulkSyncMutation = useMutation({
    mutationKey: ['inventory-bulk-sync'],
    mutationFn: async (items: InventoryListItem[]) => {
      const itemsToSync = items.filter(item => 
        !item.shopify_product_id && item.store_key && item.shopify_location_gid
      );

      if (itemsToSync.length === 0) {
        throw new Error('No unsynced items in selection');
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of itemsToSync) {
        try {
          const { error } = await supabase.rpc('queue_shopify_sync', {
            item_id: item.id,
            sync_action: 'create'
          });

          if (error) throw error;
          successCount++;
        } catch (error) {
          logger.error(`Failed to queue ${item.sku}`, error as Error);
          failCount++;
        }
      }

      if (successCount > 0) {
        await supabase.functions.invoke('shopify-sync', { body: {} });
      }

      return { successCount, failCount };
    },
    onSuccess: ({ successCount, failCount }) => {
      if (successCount > 0) {
        toast.success(`${successCount} items queued for sync to Shopify`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for sync`);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start bulk sync');
    },
  });

  // Bulk resync selected items
  const bulkResyncMutation = useMutation({
    mutationKey: ['inventory-bulk-resync'],
    mutationFn: async (selectedItemIds: string[]) => {
      const toastId = toast.loading(`Fetching fresh data for ${selectedItemIds.length} items...`);

      try {
        const { data: freshItems, error: fetchError } = await supabase
          .from('intake_items')
          .select('*')
          .in('id', selectedItemIds);

        if (fetchError) throw fetchError;

        const itemsToResync = freshItems.filter(item => 
          item.store_key && item.shopify_location_gid && item.sku && !item.deleted_at
        );

        if (itemsToResync.length === 0) {
          toast.dismiss(toastId);
          throw new Error('No valid items in selection to resync');
        }

        const rawItems = itemsToResync.filter(item => 
          item.type?.toLowerCase() === 'raw' && !item.psa_cert
        );
        const gradedItems = itemsToResync.filter(item => 
          item.type?.toLowerCase() === 'graded' || item.psa_cert
        );

        toast.dismiss(toastId);
        const progressToastId = toast.loading(`Resyncing ${itemsToResync.length} items to Shopify...`);

        let created = 0, updated = 0, failed = 0;

        for (const item of rawItems) {
          try {
            const result = await sendRawToShopify({
              item_id: item.id,
              storeKey: item.store_key as 'hawaii' | 'las_vegas',
              locationGid: item.shopify_location_gid,
              vendor: item.vendor
            });
            
            if (result?.success) {
              if (result.created) created++;
              else if (result.adjusted) updated++;
            }
          } catch (error) {
            logger.error(`Failed to resync raw item ${item.sku}`, error as Error);
            failed++;
          }
        }

        for (const item of gradedItems) {
          try {
            const result = await sendGradedToShopify({
              storeKey: item.store_key as 'hawaii' | 'las_vegas',
              locationGid: item.shopify_location_gid,
              vendor: item.vendor,
              item: {
                id: item.id,
                sku: item.sku,
                psa_cert: item.psa_cert,
                barcode: item.sku,
                title: item.subject,
                price: item.price,
                grade: item.grade,
                quantity: item.quantity,
                year: item.year,
                brand_title: item.brand_title,
                subject: item.subject,
                card_number: item.card_number,
                variant: item.variant,
                category_tag: item.category,
                image_url: item.image_urls?.[0],
                cost: item.cost
              }
            });
            
            if (result?.success) {
              created++;
            }
          } catch (error) {
            logger.error(`Failed to resync graded item ${item.sku}`, error as Error);
            failed++;
          }
        }

        toast.dismiss(progressToastId);
        return { created, updated, failed };
      } catch (error) {
        toast.dismiss(toastId);
        throw error;
      }
    },
    onSuccess: ({ created, updated, failed }) => {
      if (created > 0 || updated > 0) {
        toast.success(
          `Resync complete: ${created} created, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}`
        );
      } else if (failed > 0) {
        toast.error(`Resync failed for ${failed} items`);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to start bulk resync', { description: error.message });
    },
  });

  // Bulk retry sync for error items
  const bulkRetrySyncMutation = useMutation({
    mutationKey: ['inventory-bulk-retry'],
    mutationFn: async (errorItems: InventoryListItem[]) => {
      if (errorItems.length === 0) {
        throw new Error('No selected items with sync errors found');
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of errorItems) {
        try {
          const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
            item_id: item.id,
            sync_action: 'create'
          });

          if (queueError) {
            logger.error(`Failed to queue ${item.sku}`, queueError as Error);
            failCount++;
          } else {
            successCount++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error queuing ${item.sku}`, error as Error);
          failCount++;
        }
      }

      if (successCount > 0) {
        await supabase.functions.invoke('shopify-sync', { body: {} });
      }

      return { successCount, failCount };
    },
    onSuccess: ({ successCount, failCount }) => {
      if (successCount > 0) {
        toast.success(`${successCount} items queued for retry sync`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for retry`);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start bulk retry');
    },
  });

  // ============ DERIVED STATE ============

  // Build a map of item IDs to their current action state
  const getItemActionState = useCallback((itemId: string): ItemActionState => {
    // Check single item mutations
    if (syncMutation.isPending && syncMutation.variables?.id === itemId) {
      return { isLoading: true, action: 'sync' };
    }
    if (retrySyncMutation.isPending && retrySyncMutation.variables?.id === itemId) {
      return { isLoading: true, action: 'retry' };
    }
    if (resyncMutation.isPending && resyncMutation.variables?.id === itemId) {
      return { isLoading: true, action: 'resync' };
    }
    if (removeMutation.isPending) {
      const items = removeMutation.variables;
      const itemArray = Array.isArray(items) ? items : [items];
      if (itemArray?.some(i => i.id === itemId)) {
        return { isLoading: true, action: 'remove' };
      }
    }
    if (deleteMutation.isPending) {
      const items = deleteMutation.variables;
      if (items?.some(i => i.id === itemId)) {
        return { isLoading: true, action: 'delete' };
      }
    }

    return { isLoading: false, action: null };
  }, [syncMutation, retrySyncMutation, resyncMutation, removeMutation, deleteMutation]);

  // Bulk action state
  const bulkActionState: BulkActionState = useMemo(() => {
    if (bulkSyncMutation.isPending) {
      const itemIds = new Set(bulkSyncMutation.variables?.map(i => i.id) || []);
      return { isLoading: true, action: 'bulkSync', pendingItemIds: itemIds };
    }
    if (bulkResyncMutation.isPending) {
      const itemIds = new Set(bulkResyncMutation.variables || []);
      return { isLoading: true, action: 'bulkResync', pendingItemIds: itemIds };
    }
    if (bulkRetrySyncMutation.isPending) {
      const itemIds = new Set(bulkRetrySyncMutation.variables?.map(i => i.id) || []);
      return { isLoading: true, action: 'bulkRetry', pendingItemIds: itemIds };
    }
    return { isLoading: false, action: null, pendingItemIds: new Set() };
  }, [bulkSyncMutation, bulkResyncMutation, bulkRetrySyncMutation]);

  // Helper to check if any action is pending for an item
  const isItemBusy = useCallback((itemId: string): boolean => {
    const state = getItemActionState(itemId);
    if (state.isLoading) return true;
    return bulkActionState.pendingItemIds.has(itemId);
  }, [getItemActionState, bulkActionState]);

  // Legacy compatibility: syncingRowId equivalent
  const syncingRowId = useMemo(() => {
    if (syncMutation.isPending) return syncMutation.variables?.id ?? null;
    if (retrySyncMutation.isPending) return retrySyncMutation.variables?.id ?? null;
    if (resyncMutation.isPending) return resyncMutation.variables?.id ?? null;
    return null;
  }, [syncMutation, retrySyncMutation, resyncMutation]);

  return {
    // Single item mutations
    syncMutation,
    retrySyncMutation,
    resyncMutation,
    removeMutation,
    deleteMutation,

    // Bulk mutations
    bulkSyncMutation,
    bulkResyncMutation,
    bulkRetrySyncMutation,

    // State helpers
    getItemActionState,
    bulkActionState,
    isItemBusy,
    syncingRowId,

    // Legacy boolean state for backward compatibility
    bulkRetrying: bulkRetrySyncMutation.isPending,
    bulkSyncing: bulkSyncMutation.isPending || bulkResyncMutation.isPending,
    removingFromShopify: removeMutation.isPending,
    deletingItems: deleteMutation.isPending,

    // Convenience action wrappers
    handleSync: (item: InventoryListItem) => syncMutation.mutate(item),
    handleRetrySync: (item: InventoryListItem) => retrySyncMutation.mutate(item),
    handleResync: (item: InventoryListItem) => resyncMutation.mutate(item),
    handleRemoveFromShopify: (items: InventoryListItem | InventoryListItem[] | null) => {
      if (items) removeMutation.mutate(items);
    },
    handleDeleteItems: (items: InventoryListItem[]) => deleteMutation.mutate(items),
    handleSyncSelected: (items: InventoryListItem[]) => {
      if (items.length === 0) {
        toast.info('No items selected');
        return;
      }
      bulkSyncMutation.mutate(items);
    },
    handleResyncSelected: (itemIds: string[]) => {
      if (itemIds.length === 0) {
        toast.info('No items selected');
        return;
      }
      bulkResyncMutation.mutate(itemIds);
    },
    handleBulkRetrySync: (errorItems: InventoryListItem[]) => {
      bulkRetrySyncMutation.mutate(errorItems);
    },
  };
}
