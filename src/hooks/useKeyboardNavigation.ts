import { useCallback, useEffect, useRef } from 'react';

interface UseKeyboardNavigationOptions {
  items: any[];
  selectedItems: Set<string>;
  onToggleSelection: (id: string) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onSync?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  enabled?: boolean;
}

export function useKeyboardNavigation({
  items,
  selectedItems,
  onToggleSelection,
  onClearSelection,
  onSelectAll,
  onSync,
  searchInputRef,
  enabled = true,
}: UseKeyboardNavigationOptions) {
  const focusedIndexRef = useRef<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't capture keys when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only handle Escape in inputs
      if (event.key === 'Escape') {
        (target as HTMLInputElement).blur();
        event.preventDefault();
      }
      return;
    }

    switch (event.key) {
      case 'j':
        // Move focus down
        event.preventDefault();
        if (items.length > 0) {
          focusedIndexRef.current = Math.min(focusedIndexRef.current + 1, items.length - 1);
          if (focusedIndexRef.current < 0) focusedIndexRef.current = 0;
          scrollToFocusedItem();
        }
        break;

      case 'k':
        // Move focus up
        event.preventDefault();
        if (items.length > 0) {
          focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0);
          scrollToFocusedItem();
        }
        break;

      case 'x':
        // Toggle selection on focused item
        event.preventDefault();
        if (focusedIndexRef.current >= 0 && focusedIndexRef.current < items.length) {
          const item = items[focusedIndexRef.current];
          onToggleSelection(item.id);
        }
        break;

      case 'Escape':
        // Clear selection
        event.preventDefault();
        onClearSelection();
        focusedIndexRef.current = -1;
        break;

      case 'A':
        // Shift+A: Select all visible
        if (event.shiftKey) {
          event.preventDefault();
          onSelectAll();
        }
        break;

      case 's':
        // Sync selected items
        if (selectedItems.size > 0 && onSync) {
          event.preventDefault();
          onSync();
        }
        break;

      case '/':
        // Focus search
        event.preventDefault();
        searchInputRef?.current?.focus();
        break;

      case 'ArrowDown':
        // Alternative to j
        event.preventDefault();
        if (items.length > 0) {
          focusedIndexRef.current = Math.min(focusedIndexRef.current + 1, items.length - 1);
          if (focusedIndexRef.current < 0) focusedIndexRef.current = 0;
          scrollToFocusedItem();
        }
        break;

      case 'ArrowUp':
        // Alternative to k
        event.preventDefault();
        if (items.length > 0) {
          focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0);
          scrollToFocusedItem();
        }
        break;

      case ' ':
        // Space: Toggle selection (like x)
        if (focusedIndexRef.current >= 0 && focusedIndexRef.current < items.length) {
          event.preventDefault();
          const item = items[focusedIndexRef.current];
          onToggleSelection(item.id);
        }
        break;
    }
  }, [enabled, items, onToggleSelection, onClearSelection, onSelectAll, onSync, searchInputRef, selectedItems.size]);

  const scrollToFocusedItem = useCallback(() => {
    // This would integrate with the virtualizer - for now just track the index
    // The virtual list can observe focusedIndexRef to scroll appropriately
  }, []);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  return {
    focusedIndex: focusedIndexRef.current,
    containerRef,
    setFocusedIndex: (index: number) => {
      focusedIndexRef.current = index;
    },
  };
}
