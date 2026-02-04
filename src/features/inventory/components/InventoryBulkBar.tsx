import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckSquare } from 'lucide-react';
import { BulkActionsToolbar } from '@/components/inventory/BulkActionsToolbar';
import type { InventoryBulkBarProps } from '../types';

interface InventoryBulkBarContainerProps extends InventoryBulkBarProps {
  totalCount: number;
  hasNextPage?: boolean;
}

export const InventoryBulkBar = React.memo(({
  selectedItems,
  filteredItems,
  isAdmin,
  statusFilter,
  bulkRetrying,
  bulkSyncing,
  onSelectAll,
  onClearSelection,
  onBulkRetrySync,
  onSyncSelected,
  onResyncSelected,
  onDeleteSelected,
  onBulkToggleEbay,
  onPrintSelected,
  totalCount,
  hasNextPage,
}: InventoryBulkBarContainerProps) => {
  const selectedCount = selectedItems.size;

  return (
    <div className="space-y-4">
      {/* Bulk Actions - only when items selected */}
      {selectedCount > 0 && (
        <div className="border-t pt-4">
          <BulkActionsToolbar
            selectedCount={selectedCount}
            totalCount={filteredItems.length}
            isAdmin={isAdmin}
            statusFilter={statusFilter}
            bulkRetrying={bulkRetrying}
            bulkSyncing={bulkSyncing}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onBulkRetrySync={onBulkRetrySync}
            onSyncSelected={onSyncSelected}
            onResyncSelected={onResyncSelected}
            onDeleteSelected={onDeleteSelected}
            onBulkToggleEbay={onBulkToggleEbay}
            onPrintSelected={onPrintSelected}
          />
        </div>
      )}

      {/* Item count footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
        <span>
          Showing {filteredItems.length} items {totalCount > filteredItems.length && `of ${totalCount}`}
          {hasNextPage && ' • Scroll to load more'}
        </span>
        {selectedCount === 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            disabled={filteredItems.length === 0}
            className="h-7 text-xs"
          >
            <CheckSquare className="h-3 w-3 mr-1.5" />
            Select All
          </Button>
        )}
      </div>
    </div>
  );
});

InventoryBulkBar.displayName = 'InventoryBulkBar';
