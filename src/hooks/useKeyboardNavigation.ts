import { useCallback, useEffect, useRef, useState } from 'react';

interface UseKeyboardNavigationOptions {
  items: any[];
  selectedItems: Set<string>;
  onToggleSelection: (id: string) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onSync?: () => void;
  onPrint?: () => void;
  onExpandDetails?: (id: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  virtualizerScrollToIndex?: (index: number) => void;
  enabled?: boolean;
}

export function useKeyboardNavigation({
  items,
  selectedItems,
  onToggleSelection,
  onClearSelection,
  onSelectAll,
  onSync,
  onPrint,
  onExpandDetails,
  searchInputRef,
  virtualizerScrollToIndex,
  enabled = true,
}: UseKeyboardNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToFocusedItem = useCallback((index: number) => {
    if (virtualizerScrollToIndex) {
      virtualizerScrollToIndex(index);
    }
  }, [virtualizerScrollToIndex]);

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
      case 'ArrowDown':
        // Move focus down
        event.preventDefault();
        if (items.length > 0) {
          setFocusedIndex(prev => {
            const newIndex = Math.min(prev + 1, items.length - 1);
            const actualIndex = newIndex < 0 ? 0 : newIndex;
            scrollToFocusedItem(actualIndex);
            return actualIndex;
          });
        }
        break;

      case 'k':
      case 'ArrowUp':
        // Move focus up
        event.preventDefault();
        if (items.length > 0) {
          setFocusedIndex(prev => {
            const newIndex = Math.max(prev - 1, 0);
            scrollToFocusedItem(newIndex);
            return newIndex;
          });
        }
        break;

      case 'x':
      case ' ':
        // Toggle selection on focused item
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          event.preventDefault();
          const item = items[focusedIndex];
          onToggleSelection(item.id);
        }
        break;

      case 'Enter':
        // Expand details for focused item
        if (focusedIndex >= 0 && focusedIndex < items.length && onExpandDetails) {
          event.preventDefault();
          const item = items[focusedIndex];
          onExpandDetails(item.id);
        }
        break;

      case 'Escape':
        // Clear selection
        event.preventDefault();
        onClearSelection();
        setFocusedIndex(-1);
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

      case 'p':
        // Print selected items
        if (selectedItems.size > 0 && onPrint) {
          event.preventDefault();
          onPrint();
        }
        break;

      case '/':
        // Focus search
        event.preventDefault();
        searchInputRef?.current?.focus();
        break;

      case 'g':
        // Go to top
        event.preventDefault();
        setFocusedIndex(0);
        scrollToFocusedItem(0);
        break;

      case 'G':
        // Go to bottom (Shift+G)
        if (event.shiftKey && items.length > 0) {
          event.preventDefault();
          const lastIndex = items.length - 1;
          setFocusedIndex(lastIndex);
          scrollToFocusedItem(lastIndex);
        }
        break;
    }
  }, [enabled, items, focusedIndex, onToggleSelection, onClearSelection, onSelectAll, onSync, onPrint, onExpandDetails, searchInputRef, selectedItems.size, scrollToFocusedItem]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Reset focused index when items change significantly
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, focusedIndex]);

  return {
    focusedIndex,
    containerRef,
    setFocusedIndex,
  };
}

