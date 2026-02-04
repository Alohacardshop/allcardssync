import { useState, useCallback } from 'react';
import type { InventoryListItem } from '../types';

interface UseInventorySelectionOptions {
  items: InventoryListItem[];
}

interface UseInventorySelectionReturn {
  selectedItems: Set<string>;
  expandedItems: Set<string>;
  toggleSelection: (itemId: string) => void;
  toggleExpanded: (itemId: string) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  selectedCount: number;
}

export function useInventorySelection({ 
  items 
}: UseInventorySelectionOptions): UseInventorySelectionReturn {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const allVisibleIds = new Set(items.map(item => item.id));
    setSelectedItems(allVisibleIds);
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const isAllSelected = items.length > 0 && selectedItems.size === items.length;
  const selectedCount = selectedItems.size;

  return {
    selectedItems,
    expandedItems,
    toggleSelection,
    toggleExpanded,
    selectAllVisible,
    clearSelection,
    isAllSelected,
    selectedCount,
  };
}
