import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, ExternalLink, RotateCcw, Loader2, ShoppingBag, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEbayListing } from '@/hooks/useEbayListing';
import type { InventoryItem } from '@/types/inventory';

interface InventoryItemActionsRowProps {
  item: InventoryItem;
  isAdmin: boolean;
  syncingRowId: string | null;
  onSync: (item: InventoryItem) => void;
  onRetrySync: (item: InventoryItem) => void;
  onResync: (item: InventoryItem) => void;
  onRemove: (item: InventoryItem) => void;
  onDelete?: (item: InventoryItem) => void;
  onSyncDetails: (item: InventoryItem) => void;
}

export const InventoryItemActionsRow = memo(({
  item,
  isAdmin,
  syncingRowId,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails,
}: InventoryItemActionsRowProps) => {
  const { toggleListOnEbay, isToggling } = useEbayListing();

  return (
    <div className="flex flex-wrap gap-1">
      {item.shopify_sync_status === 'pending' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSync(item)}
          disabled={syncingRowId === item.id}
        >
          {syncingRowId === item.id ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <ExternalLink className="h-3 w-3 mr-1" />
          )}
          Sync
        </Button>
      )}
      
      {item.shopify_sync_status === 'error' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRetrySync(item)}
          disabled={syncingRowId === item.id}
        >
          {syncingRowId === item.id ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3 mr-1" />
          )}
          Retry
        </Button>
      )}
      
      {item.shopify_sync_status === 'synced' && item.shopify_product_id && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResync(item)}
          disabled={syncingRowId === item.id}
          title="Re-sync this item to update Shopify product information"
        >
          {syncingRowId === item.id ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3 mr-1" />
          )}
          Resync
        </Button>
      )}
      
      {item.shopify_product_id && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRemove(item)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Remove
        </Button>
      )}
      
      {isAdmin && onDelete && !item.deleted_at && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      )}
      
      {/* eBay toggle button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={item.list_on_ebay ? "default" : "outline"}
            size="sm"
            onClick={() => toggleListOnEbay(item.id, item.list_on_ebay || false)}
            disabled={isToggling === item.id}
            className={cn(
              item.list_on_ebay && "bg-primary hover:bg-primary/90"
            )}
          >
            {isToggling === item.id ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ShoppingBag className="h-3 w-3 mr-1" />
            )}
            eBay
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{item.list_on_ebay ? 'Remove from eBay' : 'Mark for eBay listing'}</p>
        </TooltipContent>
      </Tooltip>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSyncDetails(item)}
      >
        <FileText className="h-3 w-3 mr-1" />
        Details
      </Button>
    </div>
  );
});

InventoryItemActionsRow.displayName = 'InventoryItemActionsRow';
