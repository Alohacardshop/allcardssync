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
  Trash2,
  FileText,
  ShoppingBag,
  History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { InlineQuantityEditor } from '@/components/inventory-card/InlineQuantityEditor';
import { EbayStatusBadge } from '@/components/inventory/EbayStatusBadge';
import { LocationStockPopover } from '@/components/inventory/LocationStockPopover';
import { ItemAuditDialog } from '@/components/inventory/ItemAuditDialog';
import { QuantityAuditTooltip } from '@/components/inventory/QuantityAuditTooltip';
import { useEbayListing } from '@/hooks/useEbayListing';
import type { VirtualInventoryListProps, InventoryListItem } from '../types';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { getShortLocationName } from '@/hooks/useLocationNames';
import type { InventoryLevel } from '@/hooks/useInventoryLevels';

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

interface InventoryLevelCompact {
  location_gid: string;
  available: number;
}

interface TableRowProps {
  item: InventoryListItem;
  isSelected: boolean;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
  /** Inventory levels for this item */
  itemLevels?: InventoryLevelCompact[];
  /** Selected location for Shopify-truth display */
  selectedLocationGid?: string | null;
  /** Whether quantity editing is disabled (e.g., Shopify truth mode) */
  quantityReadOnly?: boolean;
  /** Reason for read-only quantity, shown in tooltip */
  quantityReadOnlyReason?: string;
  onToggleSelection: (id: string) => void;
  onSync: (item: InventoryListItem) => void;
  onRetrySync: (item: InventoryListItem) => void;
  onResync: (item: InventoryListItem) => void;
  onRemove: (item: InventoryListItem) => void;
  onDelete?: (item: InventoryListItem) => void;
  onSyncDetails: (item: InventoryListItem) => void;
  onViewAudit?: (item: InventoryListItem) => void;
}

const TableRow = memo(({
  item,
  isSelected,
  isAdmin,
  syncingRowId,
  locationsMap,
  itemLevels,
  selectedLocationGid,
  quantityReadOnly,
  quantityReadOnlyReason,
  onToggleSelection,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails,
  onViewAudit,
}: TableRowProps) => {
  const { toggleListOnEbay, isToggling } = useEbayListing();
  const title = useMemo(() => generateTitle(item), [item]);
  const syncStatus = useMemo(() => getSyncStatus(item), [item]);
  const status = item.shopify_sync_status as string | null;
  const isLoading = syncingRowId === item.id;

  // Calculate Shopify-truth quantity:
  // 1. If selectedLocationGid is set and we have levels for that location, use Shopify's available
  // 2. Otherwise fall back to item.quantity
  const displayQuantity = useMemo(() => {
    if (!itemLevels || itemLevels.length === 0) {
      return item.quantity;
    }
    
    // If a specific location is selected, find the level for that location
    if (selectedLocationGid) {
      const locationLevel = itemLevels.find(l => l.location_gid === selectedLocationGid);
      if (locationLevel !== undefined) {
        return locationLevel.available;
      }
    }
    
    // Otherwise, find the level for the item's primary location
    if (item.shopify_location_gid) {
      const primaryLevel = itemLevels.find(l => l.location_gid === item.shopify_location_gid);
      if (primaryLevel !== undefined) {
        return primaryLevel.available;
      }
    }
    
    // Fallback to intake_items.quantity
    return item.quantity;
  }, [item.quantity, item.shopify_location_gid, itemLevels, selectedLocationGid]);

  // Determine primary action based on status
  const primaryAction = useMemo(() => {
    if (item.deleted_at || item.sold_at) return null;
    if (status === 'pending') return { label: 'Sync', action: () => onSync(item) };
    if (status === 'error') return { label: 'Retry', action: () => onRetrySync(item) };
    if (status === 'synced' && item.shopify_product_id) return { label: 'Resync', action: () => onResync(item) };
    return null;
  }, [status, item, onSync, onRetrySync, onResync]);

  const formattedDate = new Date(item.updated_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // CSS variable for consistent grid template across header and rows
  // Fixed column widths ensure loading states never shift layout
  const gridTemplate = "40px 90px minmax(200px, 1fr) 110px 75px 65px 85px 75px 85px 95px 70px 44px";

  return (
    <div 
      className={cn(
        "grid gap-2 items-center px-3 min-h-[44px] border-b border-border text-sm transition-colors",
        // Hover state - subtle background
        "hover:bg-muted/40",
        // Selected state - more prominent
        isSelected && "bg-primary/8 hover:bg-primary/12 border-l-2 border-l-primary",
        // Deleted state
        item.deleted_at && "opacity-50",
        // Focus-within for keyboard navigation
        "focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring"
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
        {/* Checkbox - fixed height container */}
        <div className="flex items-center justify-center h-[44px]">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(item.id)}
            aria-label={`Select ${title}`}
          />
        </div>

        {/* SKU - monospace, muted, fixed height */}
        <div className="font-mono text-xs text-muted-foreground truncate leading-tight flex items-center h-[44px]" title={item.sku || ''}>
          {item.sku || '—'}
        </div>

        {/* Title - semibold, primary color, fixed height */}
        <div className="truncate font-semibold text-foreground leading-tight flex items-center h-[44px]" title={title}>
          {title}
        </div>

        {/* Location with hover popover for multi-location stock - fixed height */}
        <div className="flex items-center h-[44px]">
          <LocationStockPopover
            primaryLocationGid={item.shopify_location_gid}
            locationsMap={locationsMap}
            inventoryItemId={item.shopify_inventory_item_id}
            className="leading-tight"
          />
        </div>

        {/* Price - right aligned, tabular nums, fixed height */}
        <div className="text-right tabular-nums font-medium text-foreground pr-1 flex items-center justify-end h-[44px]">
          ${(item.price || 0).toFixed(2)}
        </div>

        {/* Quantity - center aligned, shows Shopify-truth quantity, fixed container */}
        <QuantityAuditTooltip itemId={item.id} sku={item.sku}>
          <div className="flex items-center justify-center h-[44px] cursor-help">
          <InlineQuantityEditor
            itemId={item.id}
            quantity={displayQuantity}
            shopifyProductId={item.shopify_product_id}
            shopifyInventoryItemId={item.shopify_inventory_item_id}
            compact
            readOnly={quantityReadOnly}
            readOnlyReason={quantityReadOnlyReason}
          />
          </div>
        </QuantityAuditTooltip>

        {/* Shopify Status - consistent chip with fixed container height */}
        <div className="flex items-center justify-center h-[44px]">
          <Badge 
            variant={syncStatus.variant}
            className={cn(
              "text-[10px] h-5 px-1.5 font-medium whitespace-nowrap min-w-[52px] justify-center",
              syncStatus.loading && "animate-pulse"
            )}
          >
            {syncStatus.loading && <Loader2 className="h-3 w-3 mr-0.5 animate-spin" aria-hidden="true" />}
            {syncStatus.label}
          </Badge>
        </div>

        {/* Print Status - minimal badge with fixed container height */}
        <div className="flex items-center justify-center h-[44px]">
          <Badge
            variant={item.printed_at ? "default" : "outline"}
            className={cn(
              "text-[10px] h-5 px-1.5 font-medium whitespace-nowrap min-w-[50px] justify-center",
              item.printed_at 
                ? "bg-primary/10 text-primary border-primary/20" 
                : "text-muted-foreground border-muted-foreground/30"
            )}
          >
            {item.printed_at ? 'Printed' : 'No Label'}
          </Badge>
        </div>

        {/* eBay Status - fixed container height */}
        <div className="flex items-center justify-center h-[44px]">
          <EbayStatusBadge
            syncStatus={item.ebay_sync_status}
            listingId={item.ebay_listing_id}
            listingUrl={item.ebay_listing_url}
            syncError={item.ebay_sync_error}
            listOnEbay={item.list_on_ebay}
          />
        </div>

        {/* Updated - relative with tooltip, fixed container height */}
        <div className="flex items-center justify-center h-[44px]">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-default truncate tabular-nums">
                {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true }).replace('about ', '')}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs font-medium">
              {formattedDate}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Primary Action - fixed width container to prevent shifting */}
        <div className="flex items-center justify-center h-[44px] min-w-[70px]">
          {primaryAction ? (
            <Button
              variant="outline"
              size="sm"
              onClick={primaryAction.action}
              disabled={isLoading}
              className="h-6 px-2 text-[10px] font-medium min-w-[52px] focus-visible:ring-2"
              aria-label={`${primaryAction.label} ${title}`}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-label="Saving..." />
              ) : (
                primaryAction.label
              )}
            </Button>
          ) : (
            <span className="min-w-[52px] h-6 inline-block" aria-hidden="true" />
          )}
        </div>

        {/* Kebab Menu - fixed container height */}
        <div className="flex items-center justify-center h-[44px]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0 hover:bg-muted focus-visible:ring-2"
                aria-label={`More actions for ${title}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem 
                onClick={() => onSyncDetails(item)}
                aria-label="View item details"
              >
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                View Details
              </DropdownMenuItem>
              {onViewAudit && (
                <DropdownMenuItem 
                  onClick={() => onViewAudit(item)}
                  aria-label="View change history"
                >
                  <History className="h-4 w-4 mr-2" aria-hidden="true" />
                  Why did this change?
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => toggleListOnEbay(item.id, item.list_on_ebay || false)}
                disabled={isToggling === item.id}
                aria-label={item.list_on_ebay ? 'Remove item from eBay listing' : 'Add item to eBay listing'}
              >
                <ShoppingBag className="h-4 w-4 mr-2" aria-hidden="true" />
                {item.list_on_ebay ? 'Remove from eBay' : 'List on eBay'}
              </DropdownMenuItem>
              {item.shopify_product_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onRemove(item)} 
                    className="text-destructive"
                    aria-label="Remove item from Shopify"
                  >
                    <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Remove from Shopify
                  </DropdownMenuItem>
                </>
              )}
              {isAdmin && onDelete && !item.deleted_at && (
                <DropdownMenuItem 
                  onClick={() => onDelete(item)} 
                  className="text-destructive"
                  aria-label="Permanently delete item"
                >
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Delete Item
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
  inventoryLevelsMap,
  selectedLocationGid,
  quantityReadOnly,
  quantityReadOnlyReason,
  onToggleSelection,
  onSetSelection,
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
  const [auditDialogItem, setAuditDialogItem] = useState<InventoryListItem | null>(null);

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

  // Batched select all - uses setSelection if available for performance
  const handleSelectAll = useCallback(() => {
    if (onSetSelection) {
      if (allSelected) {
        // Clear all visible items
        const visibleIds = items.map(item => item.id);
        onSetSelection(visibleIds, 'remove');
      } else {
        // Select all visible items
        const visibleIds = items.map(item => item.id);
        onSetSelection(visibleIds, 'add');
      }
    } else {
      // Fallback to individual toggles
      items.forEach(item => {
        const isCurrentlySelected = selectedItems.has(item.id);
        if (allSelected && isCurrentlySelected) {
          onToggleSelection(item.id);
        } else if (!allSelected && !isCurrentlySelected) {
          onToggleSelection(item.id);
        }
      });
    }
  }, [items, selectedItems, allSelected, onToggleSelection, onSetSelection]);

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

  // CSS variable for consistent grid template
  // Match column widths exactly with TableRow for layout stability
  const gridTemplate = "40px 90px minmax(200px, 1fr) 110px 75px 65px 85px 75px 85px 95px 70px 44px";

  return (
    <>
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border bg-card overflow-hidden flex flex-col h-full">
        {/* Horizontal scroll wrapper */}
        <div className="overflow-x-auto flex-1 flex flex-col min-h-0">
          <div className="min-w-[1100px] flex flex-col h-full">
            {/* Sticky Header */}
            <div 
              className="shrink-0 grid gap-2 items-center px-3 h-[44px] bg-muted/60 border-b font-medium text-xs sticky top-0 z-10"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex items-center justify-center h-full">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label={allSelected ? "Deselect all items" : someSelected ? "Select all items" : "Select all items"}
                />
              </div>
              <SortableHeader label="SKU" field="sku" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Title" field="title" sortConfig={sortConfig} onSort={handleSort} />
              <span className="text-muted-foreground">Location</span>
              <SortableHeader label="Price" field="price" sortConfig={sortConfig} onSort={handleSort} className="justify-end pr-1" />
              <SortableHeader label="Qty" field="quantity" sortConfig={sortConfig} onSort={handleSort} className="justify-center" />
              <span className="text-muted-foreground text-center">Shopify</span>
              <span className="text-muted-foreground text-center">Label</span>
              <span className="text-muted-foreground text-center">eBay</span>
              <SortableHeader label="Updated" field="updated_at" sortConfig={sortConfig} onSort={handleSort} className="justify-center" />
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </div>

      {/* Virtualized Rows */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
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
                  itemLevels={item.shopify_inventory_item_id ? inventoryLevelsMap?.get(item.shopify_inventory_item_id) : undefined}
                  selectedLocationGid={selectedLocationGid}
                  quantityReadOnly={quantityReadOnly}
                  quantityReadOnlyReason={quantityReadOnlyReason}
                  onToggleSelection={onToggleSelection}
                  onSync={onSync}
                  onRetrySync={onRetrySync}
                  onResync={onResync}
                  onRemove={onRemove}
                  onDelete={onDelete}
                  onSyncDetails={onSyncDetails}
                  onViewAudit={setAuditDialogItem}
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
        </div>
      </div>
    </TooltipProvider>

      <ItemAuditDialog
        open={!!auditDialogItem}
        onOpenChange={(open) => !open && setAuditDialogItem(null)}
        item={auditDialogItem}
      />
    </>
  );
});

InventoryTableView.displayName = 'InventoryTableView';
