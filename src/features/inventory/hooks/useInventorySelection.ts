import { useState, useCallback } from 'react';
import type { InventoryListItem } from '../types';

type SelectionMode = 'add' | 'remove' | 'replace';

interface UseInventorySelectionOptions {
  items: InventoryListItem[];
}

interface UseInventorySelectionReturn {
  selectedItems: Set<string>;
  expandedItems: Set<string>;
  toggleSelection: (itemId: string) => void;
  toggleExpanded: (itemId: string) => void;
  setSelection: (ids: string[], mode: SelectionMode) => void;
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

  // Batched selection update to avoid N state updates
  const setSelection = useCallback((ids: string[], mode: SelectionMode) => {
    setSelectedItems(prev => {
      switch (mode) {
        case 'replace':
          return new Set(ids);
        case 'add': {
          const newSet = new Set(prev);
          ids.forEach(id => newSet.add(id));
          return newSet;
        }
        case 'remove': {
          const newSet = new Set(prev);
          ids.forEach(id => newSet.delete(id));
          return newSet;
        }
        default:
          return prev;
      }
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const allVisibleIds = items.map(item => item.id);
    setSelection(allVisibleIds, 'replace');
  }, [items, setSelection]);

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
    setSelection,
    selectAllVisible,
    clearSelection,
    isAllSelected,
    selectedCount,
  };
}
