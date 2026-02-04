/**
 * @deprecated Use useInventoryMutations instead for per-item loading states and better error handling.
 * This hook is kept for backward compatibility during the transition period.
 */
import { useCallback } from 'react';
import { useInventoryMutations } from './useInventoryMutations';
import type { InventoryListItem } from '../types';

interface UseInventoryActionsOptions {
  selectedLocation: string | null;
  selectedItems: Set<string>;
  filteredItems: InventoryListItem[];
  isAdmin: boolean;
  refetch: () => void;
  clearSelection: () => void;
}

/**
 * Legacy wrapper around useInventoryMutations for backward compatibility.
 * New code should use useInventoryMutations directly.
 */
export function useInventoryActions({
  selectedLocation,
  selectedItems,
  filteredItems,
  isAdmin,
  refetch,
  clearSelection,
}: UseInventoryActionsOptions) {
  const mutations = useInventoryMutations({
    selectedLocation,
    isAdmin,
    onSuccess: refetch,
    clearSelection,
  });

  // Wrap bulk actions to use the filtered items from props
  const handleSyncSelected = useCallback(async () => {
    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
    mutations.handleSyncSelected(selectedItemsArray);
  }, [filteredItems, selectedItems, mutations]);

  const handleResyncSelected = useCallback(async () => {
    const selectedItemIds = Array.from(selectedItems);
    mutations.handleResyncSelected(selectedItemIds);
  }, [selectedItems, mutations]);

  const handleBulkRetrySync = useCallback(async () => {
    const errorItems = filteredItems.filter(item => 
      selectedItems.has(item.id) && 
      item.shopify_sync_status === 'error' &&
      item.store_key && 
      item.shopify_location_gid
    );
    mutations.handleBulkRetrySync(errorItems);
  }, [filteredItems, selectedItems, mutations]);

  return {
    // State (from mutations)
    syncingRowId: mutations.syncingRowId,
    bulkRetrying: mutations.bulkRetrying,
    bulkSyncing: mutations.bulkSyncing,
    removingFromShopify: mutations.removingFromShopify,
    deletingItems: mutations.deletingItems,

    // Per-item state helpers
    getItemActionState: mutations.getItemActionState,
    isItemBusy: mutations.isItemBusy,
    bulkActionState: mutations.bulkActionState,

    // Actions
    handleSync: mutations.handleSync,
    handleRetrySync: mutations.handleRetrySync,
    handleResync: mutations.handleResync,
    handleSyncSelected,
    handleResyncSelected,
    handleBulkRetrySync,
    handleRemoveFromShopify: mutations.handleRemoveFromShopify,
    handleDeleteItems: mutations.handleDeleteItems,
  };
}
