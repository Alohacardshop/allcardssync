import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { InventoryItemCard } from '@/components/InventoryItemCard';
import type { VirtualInventoryListProps } from '../types';

export const InventoryList = React.memo(({ 
  items, 
  selectedItems,
  expandedItems,
  isAdmin,
  syncingRowId,
  locationsMap,
  focusedIndex,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onScrollToIndex,
}: VirtualInventoryListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  // Expose scroll function to parent via callback
  useEffect(() => {
    if (onScrollToIndex) {
      onScrollToIndex((index: number) => {
        rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      });
    }
  }, [rowVirtualizer, onScrollToIndex]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && onLoadMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading inventory...</p>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No items found matching your criteria.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        height: '70vh',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          const isFocused = focusedIndex === virtualItem.index;
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: '1rem',
              }}
              className={isFocused ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}
            >
              <InventoryItemCard
                item={item}
                isSelected={selectedItems.has(item.id)}
                isExpanded={expandedItems.has(item.id)}
                isAdmin={isAdmin}
                syncingRowId={syncingRowId}
                locationsMap={locationsMap}
                onToggleSelection={onToggleSelection}
                onToggleExpanded={onToggleExpanded}
                onSync={onSync}
                onRetrySync={onRetrySync}
                onResync={onResync}
                onRemove={onRemove}
                onDelete={onDelete}
                onSyncDetails={onSyncDetails}
              />
            </div>
          );
        })}
        
        {/* Infinite scroll trigger */}
        {hasNextPage && (
          <div
            ref={loadMoreRef}
            style={{
              position: 'absolute',
              top: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              padding: '1rem',
              textAlign: 'center',
            }}
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            ) : (
              <Button 
                variant="outline" 
                onClick={onLoadMore}
                disabled={!hasNextPage}
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

InventoryList.displayName = 'InventoryList';
