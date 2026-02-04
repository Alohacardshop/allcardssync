import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { useQueryClient } from '@tanstack/react-query';

interface UseInventoryActionsOptions {
  selectedLocation: string | null;
  selectedItems: Set<string>;
  filteredItems: any[];
  isAdmin: boolean;
  refetch: () => void;
  clearSelection: () => void;
}

export function useInventoryActions({
  selectedLocation,
  selectedItems,
  filteredItems,
  isAdmin,
  refetch,
  clearSelection,
}: UseInventoryActionsOptions) {
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [removingFromShopify, setRemovingFromShopify] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);

  const queryClient = useQueryClient();

  // Optimistic update helper
  const createOptimisticUpdate = useCallback((
    itemIds: string[],
    updateFn: (item: any) => any
  ) => {
    queryClient.cancelQueries({ queryKey: ['inventory-list'] });
    const previousData = queryClient.getQueryData(['inventory-list']);
    
    queryClient.setQueryData(['inventory-list'], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          items: page.items.map((item: any) => 
            itemIds.includes(item.id) ? { ...item, ...updateFn(item) } : item
          )
        }))
      };
    });
    
    return { previousData };
  }, [queryClient]);

  const rollbackOptimisticUpdate = useCallback((previousData: any) => {
    if (previousData) {
      queryClient.setQueryData(['inventory-list'], previousData);
    }
  }, [queryClient]);

  const handleSync = useCallback(async (item: any) => {
    if (!selectedLocation) { 
      toast.error("Pick a location first"); 
      return;
    }
    
    setSyncingRowId(item.id);
    try {
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'update'
      });

      if (queueError) {
        throw new Error(`Failed to queue for sync: ${queueError.message}`);
      }

      await supabase.functions.invoke('shopify-sync', { body: {} });
      
      toast.success(
        `${item.sku} queued for Shopify sync`, 
        {
          action: {
            label: "View Queue",
            onClick: () => window.location.href = '/admin#queue'
          }
        }
      );
      
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to queue sync");
    } finally {
      setSyncingRowId(null);
    }
  }, [selectedLocation, queryClient]);

  const handleRetrySync = useCallback(async (item: any) => {
    try {
      if (!item.store_key || !item.shopify_location_gid) {
        toast.error('Item is missing store or location data - cannot retry');
        return;
      }
      
      setSyncingRowId(item.id);
      
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'create'
      });

      if (queueError) {
        throw new Error(`Failed to queue for retry: ${queueError.message}`);
      }

      await supabase.functions.invoke('shopify-sync', { body: {} });
      
      toast.success(`${item.sku} queued for retry`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error) {
      toast.error('Failed to retry sync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [queryClient]);

  const handleResync = useCallback(async (item: any) => {
    if (!item.store_key || !item.shopify_location_gid) {
      toast.error('Item is missing store or location data');
      return;
    }
    
    if (!item.shopify_product_id) {
      toast.error('Item has no Shopify product ID - use "Sync" instead');
      return;
    }
    
    setSyncingRowId(item.id);
    
    try {
      if (item.type?.toLowerCase() === 'graded' || item.psa_cert) {
        const result = await sendGradedToShopify({
          storeKey: item.store_key as "hawaii" | "las_vegas",
          locationGid: item.shopify_location_gid,
          vendor: (item as any).vendor,
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

        if (result?.success) {
          toast.success(`${item.sku} resynced to Shopify with barcode`);
        }
      } else {
        const result = await sendRawToShopify({
          item_id: item.id,
          storeKey: item.store_key as "hawaii" | "las_vegas",
          locationGid: item.shopify_location_gid,
          vendor: (item as any).vendor
        });

        if (result?.success) {
          toast.success(`${item.sku} resynced to Shopify with barcode`);
        }
      }
      
      refetch();
    } catch (error) {
      logger.error('Resync failed', error as Error, { itemId: item.id, sku: item.sku });
      toast.error('Failed to resync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [refetch]);

  const handleSyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncing) return;

    setBulkSyncing(true);

    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
    const itemsToSync = selectedItemsArray.filter(item => 
      !item.shopify_product_id && item.store_key && item.shopify_location_gid
    );

    if (itemsToSync.length === 0) {
      toast.info('No unsynced items in selection');
      setBulkSyncing(false);
      return;
    }

    try {
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
        toast.success(`${successCount} items queued for sync to Shopify`);
      }

      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for sync`);
      }

      refetch();
    } catch (error) {
      toast.error('Failed to start bulk sync');
    } finally {
      setBulkSyncing(false);
    }
  }, [filteredItems, selectedItems, refetch, bulkSyncing]);

  const handleResyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncing) return;

    setBulkSyncing(true);

    const toastId = toast.loading(`Fetching fresh data for ${selectedItems.size} items...`);
    
    try {
      const { data: freshItems, error: fetchError } = await supabase
        .from('intake_items')
        .select('*')
        .in('id', Array.from(selectedItems));

      if (fetchError) throw fetchError;

      const itemsToResync = freshItems.filter(item => 
        item.store_key && item.shopify_location_gid && item.sku && !item.deleted_at
      );

      if (itemsToResync.length === 0) {
        setBulkSyncing(false);
        toast.dismiss(toastId);
        toast.info('No valid items in selection to resync');
        return;
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
            storeKey: item.store_key as "hawaii" | "las_vegas",
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
            storeKey: item.store_key as "hawaii" | "las_vegas",
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

      if (created > 0 || updated > 0) {
        toast.success(
          `Resync complete: ${created} created, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}`
        );
      } else if (failed > 0) {
        toast.error(`Resync failed for ${failed} items`);
      }

      refetch();
    } catch (error) {
      toast.dismiss(toastId);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to start bulk resync', {
        description: errorMessage
      });
    } finally {
      setBulkSyncing(false);
    }
  }, [selectedItems, refetch, bulkSyncing]);

  const handleBulkRetrySync = useCallback(async () => {
    const errorItems = filteredItems.filter(item => 
      selectedItems.has(item.id) && 
      item.shopify_sync_status === 'error' &&
      item.store_key && 
      item.shopify_location_gid
    );
    
    if (errorItems.length === 0) {
      toast.error('No selected items with sync errors found');
      return;
    }

    setBulkRetrying(true);
    try {
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
        toast.success(`${successCount} items queued for retry sync`);
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for retry`);
      }

      refetch();
    } catch (error) {
      toast.error('Failed to start bulk retry');
    } finally {
      setBulkRetrying(false);
    }
  }, [filteredItems, selectedItems, refetch]);

  const handleRemoveFromShopify = useCallback(async (
    selectedItemForRemoval: any | any[] | null
  ) => {
    if (!selectedItemForRemoval) return;
    
    setRemovingFromShopify(true);
    const items = Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : [selectedItemForRemoval];
    
    try {
      const results = await Promise.allSettled(
        items.map(async (item) => {
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

      if (successful > 0) {
        toast.success(
          `Successfully removed ${successful} item${successful > 1 ? 's' : ''} from Shopify`
        );
      }

      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(`Failed to remove ${failed.length} item${failed.length > 1 ? 's' : ''}: ${firstError.message}`);
      }

      refetch();
    } catch (error: any) {
      console.error('Error removing from Shopify:', error);
      toast.error(`Failed to remove items: ${error.message}`);
    } finally {
      setRemovingFromShopify(false);
    }
  }, [refetch]);

  const handleDeleteItems = useCallback(async (items: any[]) => {
    if (!isAdmin) {
      toast.error('Only admins can delete inventory items');
      return;
    }

    const itemIds = items.map(item => item.id);
    const { previousData } = createOptimisticUpdate(
      itemIds,
      () => ({ 
        deleted_at: new Date().toISOString(),
        deleted_reason: 'Admin deleted'
      })
    );

    setDeletingItems(true);
    
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
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(r => r.removedFromShopify).length;

      const deletedItemIds = items.map(item => item.id);
      
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
                  .in('id', deletedItemIds);
                
                if (error) throw error;
                
                toast.success('Items restored');
                refetch();
              } catch (error: any) {
                toast.error('Failed to restore items: ' + error.message);
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

      refetch();
      clearSelection();
    } catch (error: any) {
      console.error('Error deleting items:', error);
      rollbackOptimisticUpdate(previousData);
      toast.error(`Failed to delete items: ${error.message}`);
    } finally {
      setDeletingItems(false);
    }
  }, [isAdmin, refetch, clearSelection, createOptimisticUpdate, rollbackOptimisticUpdate]);

  return {
    // State
    syncingRowId,
    bulkRetrying,
    bulkSyncing,
    removingFromShopify,
    deletingItems,
    // Actions
    handleSync,
    handleRetrySync,
    handleResync,
    handleSyncSelected,
    handleResyncSelected,
    handleBulkRetrySync,
    handleRemoveFromShopify,
    handleDeleteItems,
  };
}
