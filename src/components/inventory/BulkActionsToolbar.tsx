import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckSquare, RotateCcw, Upload, Trash2, Loader2, ShoppingBag, Printer, Store, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServiceFlags } from '@/hooks/useServiceFlags';

export type ResyncTarget = 'shopify' | 'ebay' | 'both';

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
  onResyncSelected: (target: ResyncTarget) => void;
  onDeleteSelected: () => void;
  onBulkToggleEbay?: (enable: boolean) => void;
  onPrintSelected?: () => void;
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
  onBulkToggleEbay,
  onPrintSelected
}: BulkActionsToolbarProps) => {
  const { ebayEnabled } = useServiceFlags();
  return (
    <div className="flex flex-col gap-3">
      {/* Selection info */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-7 text-xs text-muted-foreground"
        >
          Clear
        </Button>
      </div>

      {/* Action buttons - wrap nicely */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Print Barcodes Button */}
        {onPrintSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onPrintSelected}
            className="h-8"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        )}
        
        {/* Shopify Sync Buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSyncSelected}
          disabled={bulkSyncing}
          className="h-8"
        >
          {bulkSyncing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Store className="h-3.5 w-3.5 mr-1.5" />
          )}
          {bulkSyncing ? 'Syncing...' : 'Sync to Shopify'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkSyncing}
              className="h-8"
            >
              {bulkSyncing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Resync
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onResyncSelected('shopify')}>
              <Store className="h-3.5 w-3.5 mr-2" />
              Shopify
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onResyncSelected('ebay')}>
              <ShoppingBag className="h-3.5 w-3.5 mr-2" />
              eBay
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onResyncSelected('both')}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Both Marketplaces
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {statusFilter === 'errors' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkRetrySync}
            disabled={bulkRetrying}
            className="h-8"
          >
            {bulkRetrying ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Retry Errors
          </Button>
        )}

        {/* eBay Buttons */}
        {onBulkToggleEbay && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkToggleEbay(true)}
              className="h-8"
            >
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              eBay +
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkToggleEbay(false)}
              className="h-8"
            >
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              eBay -
            </Button>
          </>
        )}

        {isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteSelected}
            className="h-8 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
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
    prevProps.bulkSyncing === nextProps.bulkSyncing &&
    prevProps.onPrintSelected === nextProps.onPrintSelected
  );
});

BulkActionsToolbar.displayName = 'BulkActionsToolbar';