import React, { useRef, useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { 
  Loader2, 
  MoreVertical, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  ExternalLink,
  RotateCcw,
  Trash2,
  FileText,
  ShoppingBag,
  CheckCircle,
  Printer,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { InlineQuantityEditor } from '@/components/inventory-card/InlineQuantityEditor';
import { EbayStatusBadge } from '@/components/inventory/EbayStatusBadge';
import { useEbayListing } from '@/hooks/useEbayListing';
import type { VirtualInventoryListProps, InventoryListItem } from '../types';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { getShortLocationName } from '@/hooks/useLocationNames';

type SortField = 'sku' | 'title' | 'price' | 'quantity' | 'created_at' | 'updated_at';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// Generate title from item
const generateTitle = (item: InventoryListItem): string => {
  const parts: (string | number | null | undefined)[] = [];
  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);
  if (item.grade && (item.psa_cert || item.cgc_cert)) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  }
  return parts.filter(Boolean).join(' ') || 'Unknown Item';
};

// Get sync status display
const getSyncStatus = (item: InventoryListItem) => {
  const status = item.shopify_sync_status as string | null;
  if (item.deleted_at) return { label: 'Deleted', variant: 'destructive' as const };
  if (item.sold_at) return { label: 'Sold', variant: 'secondary' as const };
  if (status === 'error') return { label: 'Error', variant: 'destructive' as const };
  if (status === 'synced' && item.shopify_product_id) return { label: 'Synced', variant: 'default' as const };
  if (status === 'queued' || status === 'processing') return { label: 'Syncing', variant: 'outline' as const, loading: true };
  if (status === 'pending') return { label: 'Pending', variant: 'outline' as const };
  if (item.shopify_product_id) return { label: 'Resync', variant: 'outline' as const };
  return { label: 'Not Synced', variant: 'outline' as const };
};

interface TableRowProps {
  item: InventoryListItem;
  isSelected: boolean;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
  onToggleSelection: (id: string) => void;
  onSync: (item: InventoryListItem) => void;
  onRetrySync: (item: InventoryListItem) => void;
  onResync: (item: InventoryListItem) => void;
  onRemove: (item: InventoryListItem) => void;
  onDelete?: (item: InventoryListItem) => void;
  onSyncDetails: (item: InventoryListItem) => void;
}

const TableRow = memo(({
  item,
  isSelected,
  isAdmin,
  syncingRowId,
  locationsMap,
  onToggleSelection,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails,
}: TableRowProps) => {
  const { toggleListOnEbay, isToggling } = useEbayListing();
  const title = useMemo(() => generateTitle(item), [item]);
  const syncStatus = useMemo(() => getSyncStatus(item), [item]);
  const status = item.shopify_sync_status as string | null;
  const isLoading = syncingRowId === item.id;

  // Determine primary action based on status
  const primaryAction = useMemo(() => {
    if (item.deleted_at || item.sold_at) return null;
    if (status === 'pending') return { label: 'Sync', action: () => onSync(item), icon: ExternalLink };
    if (status === 'error') return { label: 'Retry', action: () => onRetrySync(item), icon: RotateCcw };
    if (status === 'synced' && item.shopify_product_id) return { label: 'Resync', action: () => onResync(item), icon: RotateCcw };
    return null;
  }, [status, item, onSync, onRetrySync, onResync]);

  return (
    <TooltipProvider>
      <div 
        className={cn(
          "grid grid-cols-[40px_100px_1fr_100px_80px_70px_90px_80px_90px_100px_80px_50px] gap-2 items-center px-3 py-2 border-b border-border hover:bg-muted/50 text-sm",
          isSelected && "bg-primary/5",
          item.deleted_at && "opacity-50"
        )}
      >
        {/* Checkbox */}
        <div className="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(item.id)}
          />
        </div>

        {/* SKU */}
        <div className="font-mono text-xs truncate" title={item.sku || ''}>
          {item.sku}
        </div>

        {/* Title */}
        <div className="truncate font-medium" title={title}>
          {title}
        </div>

        {/* Location */}
        <div className="text-xs truncate">
          {item.shopify_location_gid && locationsMap ? (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{getShortLocationName(item.shopify_location_gid, locationsMap)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* Price */}
        <div className="text-right tabular-nums">
          ${(item.price || 0).toFixed(2)}
        </div>

        {/* Quantity - inline editable */}
        <div className="flex justify-center">
          <InlineQuantityEditor
            itemId={item.id}
            quantity={item.quantity}
            shopifyProductId={item.shopify_product_id}
            shopifyInventoryItemId={item.shopify_inventory_item_id}
          />
        </div>

        {/* Shopify Status */}
        <div className="flex justify-center">
          <Badge 
            variant={syncStatus.variant}
            className={cn(
              "text-xs",
              syncStatus.loading && "animate-pulse"
            )}
          >
            {syncStatus.loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {syncStatus.label}
          </Badge>
        </div>

        {/* Print Status */}
        <div className="flex justify-center">
          {item.printed_at ? (
            <Tooltip>
              <TooltipTrigger>
                <CheckCircle className="h-4 w-4 text-primary" />
              </TooltipTrigger>
              <TooltipContent>Printed</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <Printer className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Not Printed</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* eBay Status */}
        <div className="flex justify-center">
          <EbayStatusBadge
            syncStatus={item.ebay_sync_status}
            listingId={item.ebay_listing_id}
            listingUrl={item.ebay_listing_url}
            syncError={item.ebay_sync_error}
            listOnEbay={item.list_on_ebay}
          />
        </div>

        {/* Updated */}
        <div className="text-xs text-muted-foreground truncate" title={item.updated_at}>
          {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
        </div>

        {/* Primary Action - fixed width */}
        <div className="flex justify-center">
          {primaryAction ? (
            <Button
              variant="outline"
              size="sm"
              onClick={primaryAction.action}
              disabled={isLoading}
              className="h-7 w-[70px] text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <primaryAction.icon className="h-3 w-3 mr-1" />
                  {primaryAction.label}
                </>
              )}
            </Button>
          ) : (
            <span className="w-[70px]" /> // Placeholder to maintain column width
          )}
        </div>

        {/* Kebab Menu */}
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSyncDetails(item)}>
                <FileText className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => toggleListOnEbay(item.id, item.list_on_ebay || false)}
                disabled={isToggling === item.id}
              >
                <ShoppingBag className="h-4 w-4 mr-2" />
                {item.list_on_ebay ? 'Remove from eBay' : 'List on eBay'}
              </DropdownMenuItem>
              {item.shopify_product_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onRemove(item)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove from Shopify
                  </DropdownMenuItem>
                </>
              )}
              {isAdmin && onDelete && !item.deleted_at && (
                <DropdownMenuItem onClick={() => onDelete(item)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Item
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
});

TableRow.displayName = 'TableRow';

interface SortableHeaderProps {
  label: string;
  field: SortField;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
  className?: string;
}

const SortableHeader = memo(({ label, field, sortConfig, onSort, className }: SortableHeaderProps) => {
  const isActive = sortConfig?.field === field;
  const Icon = isActive 
    ? (sortConfig.direction === 'asc' ? ArrowUp : ArrowDown)
    : ArrowUpDown;

  return (
    <button 
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3" />
    </button>
  );
});

SortableHeader.displayName = 'SortableHeader';

export const InventoryTableView = memo(({ 
  items: rawItems, 
  selectedItems,
  isAdmin,
  syncingRowId,
  locationsMap,
  onToggleSelection,
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
}: VirtualInventoryListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Sort items
  const items = useMemo(() => {
    if (!sortConfig) return rawItems;
    
    return [...rawItems].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortConfig.field) {
        case 'sku':
          aVal = a.sku || '';
          bVal = b.sku || '';
          break;
        case 'title':
          aVal = generateTitle(a);
          bVal = generateTitle(b);
          break;
        case 'price':
          aVal = a.price || 0;
          bVal = b.price || 0;
          break;
        case 'quantity':
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rawItems, sortConfig]);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig(prev => {
      if (prev?.field === field) {
        if (prev.direction === 'asc') return { field, direction: 'desc' };
        return null; // Clear sort
      }
      return { field, direction: 'asc' };
    });
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  // Infinite scroll
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

  // Select all visible
  const allSelected = items.length > 0 && items.every(item => selectedItems.has(item.id));
  const someSelected = items.some(item => selectedItems.has(item.id)) && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      // Deselect all
      items.forEach(item => {
        if (selectedItems.has(item.id)) {
          onToggleSelection(item.id);
        }
      });
    } else {
      // Select all
      items.forEach(item => {
        if (!selectedItems.has(item.id)) {
          onToggleSelection(item.id);
        }
      });
    }
  }, [items, selectedItems, allSelected, onToggleSelection]);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No items found matching your criteria.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Sticky Header */}
      <div className="grid grid-cols-[40px_100px_1fr_100px_80px_70px_90px_80px_90px_100px_80px_50px] gap-2 items-center px-3 py-2 bg-muted/50 border-b font-medium text-xs sticky top-0 z-10">
        <div className="flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) (el as HTMLButtonElement).dataset.indeterminate = someSelected ? 'true' : 'false';
            }}
            onCheckedChange={handleSelectAll}
          />
        </div>
        <SortableHeader label="SKU" field="sku" sortConfig={sortConfig} onSort={handleSort} />
        <SortableHeader label="Title" field="title" sortConfig={sortConfig} onSort={handleSort} />
        <span className="text-muted-foreground">Location</span>
        <SortableHeader label="Price" field="price" sortConfig={sortConfig} onSort={handleSort} className="justify-end" />
        <SortableHeader label="Qty" field="quantity" sortConfig={sortConfig} onSort={handleSort} className="justify-center" />
        <span className="text-muted-foreground text-center">Shopify</span>
        <span className="text-muted-foreground text-center">Print</span>
        <span className="text-muted-foreground text-center">eBay</span>
        <SortableHeader label="Updated" field="updated_at" sortConfig={sortConfig} onSort={handleSort} />
        <span className="text-muted-foreground text-center">Action</span>
        <span></span>
      </div>

      {/* Virtualized Rows */}
      <div
        ref={parentRef}
        style={{ height: '70vh', overflow: 'auto' }}
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
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TableRow
                  item={item}
                  isSelected={selectedItems.has(item.id)}
                  isAdmin={isAdmin}
                  syncingRowId={syncingRowId}
                  locationsMap={locationsMap}
                  onToggleSelection={onToggleSelection}
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
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              ) : (
                <Button variant="outline" size="sm" onClick={onLoadMore}>
                  Load More
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

InventoryTableView.displayName = 'InventoryTableView';
