// Type definitions for the inventory feature module
import type { CachedLocation } from '@/hooks/useLocationNames';

/**
 * Status filter options for inventory items
 */
export type InventoryStatusFilter = 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';

/**
 * Type filter options
 */
export type InventoryTypeFilter = 'all' | 'raw' | 'graded';

/**
 * Category filter options
 */
export type InventoryCategoryFilter = 'all' | 'tcg' | 'comics' | 'sealed';

/**
 * Shopify sync status filter
 */
export type ShopifySyncFilter = 'all' | 'not-synced' | 'synced' | 'queued' | 'error';

/**
 * eBay status filter
 */
export type EbayStatusFilter = 'all' | 'not-listed' | 'listed' | 'queued' | 'error';

/**
 * Print status filter
 */
export type PrintStatusFilter = 'all' | 'printed' | 'not-printed';

/**
 * Date range filter
 */
export type DateRangeFilter = 'all' | 'today' | 'yesterday' | '7days' | '30days';

/**
 * Batch filter
 */
export type BatchFilter = 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch';

/**
 * Combined filter state for inventory
 */
export interface InventoryFilterState {
  searchTerm: string;
  statusFilter: InventoryStatusFilter;
  typeFilter: InventoryTypeFilter;
  categoryFilter: InventoryCategoryFilter;
  shopifySyncFilter: ShopifySyncFilter;
  ebayStatusFilter: EbayStatusFilter;
  printStatusFilter: PrintStatusFilter;
  dateRangeFilter: DateRangeFilter;
  batchFilter: BatchFilter;
  locationFilter: string | null;
  tagFilter: string[];
  activeQuickFilter: string | null;
}

/**
 * Selection state for inventory items
 */
export interface InventorySelectionState {
  selectedItems: Set<string>;
  expandedItems: Set<string>;
}

/**
 * Props for VirtualInventoryList component
 * Uses any[] for items since they come from dynamic query results
 */
export interface VirtualInventoryListProps {
  items: any[];
  selectedItems: Set<string>;
  expandedItems: Set<string>;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
  focusedIndex?: number;
  onToggleSelection: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onSync: (item: any) => void;
  onRetrySync: (item: any) => void;
  onResync: (item: any) => void;
  onRemove: (item: any) => void;
  onDelete?: (item: any) => void;
  onSyncDetails: (item: any) => void;
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onScrollToIndex?: (scrollFn: (index: number) => void) => void;
}

/**
 * Props for filters bar component
 */
export interface InventoryFiltersBarProps {
  filters: InventoryFilterState;
  onFilterChange: <K extends keyof InventoryFilterState>(
    key: K,
    value: InventoryFilterState[K]
  ) => void;
  onClearAllFilters: () => void;
  onApplyQuickFilter: (preset: Partial<InventoryFilterState>) => void;
  locationsMap?: Map<string, CachedLocation>;
  shopifyTags: Array<{ tag: string; count: number }>;
  isLoadingTags: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

/**
 * Props for bulk actions bar
 * Uses any[] for items since they come from dynamic query results
 */
export interface InventoryBulkBarProps {
  selectedItems: Set<string>;
  filteredItems: any[];
  isAdmin: boolean;
  statusFilter: InventoryStatusFilter;
  bulkRetrying: boolean;
  bulkSyncing: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkRetrySync: () => Promise<void>;
  onSyncSelected: () => Promise<void>;
  onResyncSelected: () => Promise<void>;
  onDeleteSelected: () => void;
  onBulkToggleEbay: (enable: boolean) => void;
  onPrintSelected: () => void;
}

/**
 * Action handlers interface for inventory operations
 */
export interface InventoryActionHandlers {
  handleSync: (item: any) => Promise<void>;
  handleRetrySync: (item: any) => Promise<void>;
  handleResync: (item: any) => Promise<void>;
  handleSyncSelected: () => Promise<void>;
  handleResyncSelected: () => Promise<void>;
  handleBulkRetrySync: () => Promise<void>;
  handleRemoveFromShopify: (mode: 'delete') => Promise<void>;
  handleDeleteItems: (items: any[]) => Promise<void>;
  handlePrintSelected: () => void;
}

/**
 * Dialog state for inventory page
 */
export interface InventoryDialogState {
  showRemovalDialog: boolean;
  showDeleteDialog: boolean;
  showResyncConfirm: boolean;
  showPrintDialog: boolean;
  selectedItemForRemoval: any | any[] | null;
  selectedItemsForDeletion: any[];
  syncDetailsRow: any | null;
}
