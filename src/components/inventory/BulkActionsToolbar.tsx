import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckSquare, RotateCcw, Upload, Trash2, Loader2, ShoppingBag } from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAdmin: boolean;
  statusFilter: string;
  bulkRetrying: boolean;
  bulkSyncing: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkRetrySync: () => void;
  onSyncSelected: () => void;
  onResyncSelected: () => void;
  onDeleteSelected: () => void;
  onBulkToggleEbay?: (enable: boolean) => void;
}

export const BulkActionsToolbar = React.memo(({
  selectedCount,
  totalCount,
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
  onBulkToggleEbay
}: BulkActionsToolbarProps) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectAll}
          disabled={totalCount === 0}
        >
          <CheckSquare className="h-4 w-4 mr-2" />
          Select All ({totalCount})
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
        >
          Clear Selection
        </Button>

        {selectedCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {statusFilter === 'errors' && selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkRetrySync}
            disabled={bulkRetrying}
          >
            {bulkRetrying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            {bulkRetrying ? 'Retrying...' : 'Retry Selected'}
          </Button>
        )}

        {selectedCount > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onSyncSelected}
              disabled={bulkSyncing}
            >
              {bulkSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {bulkSyncing ? 'Syncing...' : 'Sync Selected'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onResyncSelected}
              disabled={bulkSyncing}
            >
              {bulkSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              {bulkSyncing ? 'Resyncing...' : 'Resync Selected'}
            </Button>

            {onBulkToggleEbay && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleEbay(true)}
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Add to eBay
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleEbay(false)}
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Remove from eBay
                </Button>
              </>
            )}
          </>
        )}

        {isAdmin && selectedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteSelected}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.totalCount === nextProps.totalCount &&
    prevProps.statusFilter === nextProps.statusFilter &&
    prevProps.bulkRetrying === nextProps.bulkRetrying &&
    prevProps.bulkSyncing === nextProps.bulkSyncing
  );
});

BulkActionsToolbar.displayName = 'BulkActionsToolbar';