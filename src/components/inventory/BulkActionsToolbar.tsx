import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckSquare, Printer, RotateCcw, Upload, Scissors, Trash2, Loader2 } from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAdmin: boolean;
  statusFilter: string;
  bulkPrinting: boolean;
  bulkRetrying: boolean;
  bulkSyncing: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkPrintRaw: () => void;
  onReprintSelected: () => void;
  onBulkRetrySync: () => void;
  onSyncSelected: () => void;
  onResyncSelected: () => void;
  onSendCutCommand: () => void;
  onDeleteSelected: () => void;
}

export const BulkActionsToolbar = React.memo(({
  selectedCount,
  totalCount,
  isAdmin,
  statusFilter,
  bulkPrinting,
  bulkRetrying,
  bulkSyncing,
  onSelectAll,
  onClearSelection,
  onBulkPrintRaw,
  onReprintSelected,
  onBulkRetrySync,
  onSyncSelected,
  onResyncSelected,
  onSendCutCommand,
  onDeleteSelected
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
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkPrintRaw}
          disabled={bulkPrinting}
        >
          {bulkPrinting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          {bulkPrinting ? 'Printing...' : 'Print All Unprinted Raw'}
        </Button>

        {selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReprintSelected}
            disabled={bulkPrinting}
          >
            {bulkPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {bulkPrinting ? 'Reprinting...' : `Reprint Selected (${selectedCount})`}
          </Button>
        )}

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
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onSendCutCommand}
          title="Send cut command to printer"
        >
          <Scissors className="h-4 w-4 mr-2" />
          Cut
        </Button>

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
    prevProps.bulkPrinting === nextProps.bulkPrinting &&
    prevProps.bulkRetrying === nextProps.bulkRetrying &&
    prevProps.bulkSyncing === nextProps.bulkSyncing
  );
});

BulkActionsToolbar.displayName = 'BulkActionsToolbar';
