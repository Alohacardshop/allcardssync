// Type definitions for the inventory feature module
import type { CachedLocation } from '@/hooks/useLocationNames';
import type { InventoryItem } from '@/types/inventory';

/**
 * InventoryListItem - Lightweight type for list view queries
 * Contains only fields selected by useInventoryListQuery
 */
export interface InventoryListItem {
  id: string;
  sku: string | null;
  brand_title: string | null;
  subject: string | null;
  grade: string | null;
  price: number | null;
  quantity: number;
  type: string | null;
  created_at: string;
  updated_at: string;
  printed_at: string | null;
  shopify_sync_status: string | null;
  shopify_product_id: string | null;
  shopify_inventory_item_id?: string | null;
  store_key: string | null;
  shopify_location_gid: string | null;
  main_category: string | null;
  removed_from_batch_at: string | null;
  deleted_at: string | null;
  sold_at: string | null;
  card_number: string | null;
  ebay_price_check: {
    checked_at?: string;
    ebay_average?: number;
    difference_percent?: number;
    price_count?: number;
  } | null;
  shopify_snapshot: Record<string, unknown> | null;
  ebay_listing_id: string | null;
  ebay_listing_url: string | null;
  ebay_sync_status: string | null;
  ebay_sync_error: string | null;
  list_on_ebay: boolean | null;
  psa_cert: string | null;
  cgc_cert: string | null;
  grading_company: string | null;
  vendor: string | null;
  year: string | null;
  category: string | null;
  variant: string | null;
  shopify_tags: string[] | null;
  normalized_tags: string[] | null;
  // Optional fields that may be needed for title generation
  catalog_snapshot?: {
    year?: string;
    varietyPedigree?: string;
    [key: string]: unknown;
  } | null;
}

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
 * Action types for tracking per-item state
 */
export type ActionType = 'sync' | 'retry' | 'resync' | 'remove' | 'delete';

/**
 * Per-item action state
 */
export interface ItemActionState {
  isLoading: boolean;
  action: ActionType | null;
}

/**
 * Props for VirtualInventoryList component
 */
export interface VirtualInventoryListProps {
  items: InventoryListItem[];
  selectedItems: Set<string>;
  expandedItems: Set<string>;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
  focusedIndex?: number;
  /** Optional per-item action state getter for showing loading states */
  getItemActionState?: (itemId: string) => ItemActionState;
  onToggleSelection: (id: string) => void;
  onSetSelection?: (ids: string[], mode: 'add' | 'remove' | 'replace') => void;
  onToggleExpanded: (id: string) => void;
  onSync: (item: InventoryListItem) => void;
  onRetrySync: (item: InventoryListItem) => void;
  onResync: (item: InventoryListItem) => void;
  onRemove: (item: InventoryListItem) => void;
  onDelete?: (item: InventoryListItem) => void;
  onSyncDetails: (item: InventoryListItem) => void;
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
  locationsMap?: Map<string, CachedLocation>;
  shopifyTags: Array<{ tag: string; count: number }>;
  isLoadingTags: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

/**
 * Props for bulk actions bar
 */
export interface InventoryBulkBarProps {
  selectedItems: Set<string>;
  filteredItems: InventoryListItem[];
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
  handleSync: (item: InventoryListItem) => void;
  handleRetrySync: (item: InventoryListItem) => void;
  handleResync: (item: InventoryListItem) => void;
  handleSyncSelected: () => void;
  handleResyncSelected: () => void;
  handleBulkRetrySync: () => void;
  handleRemoveFromShopify: (items: InventoryListItem | InventoryListItem[] | null) => void;
  handleDeleteItems: (items: InventoryListItem[]) => void;
  handlePrintSelected: () => void;
  // State helpers
  getItemActionState: (itemId: string) => ItemActionState;
  isItemBusy: (itemId: string) => boolean;
}

/**
 * Dialog state for inventory page
 */
export interface InventoryDialogState {
  showRemovalDialog: boolean;
  showDeleteDialog: boolean;
  showResyncConfirm: boolean;
  showPrintDialog: boolean;
  selectedItemForRemoval: InventoryListItem | InventoryListItem[] | null;
  selectedItemsForDeletion: InventoryListItem[];
  syncDetailsRow: InventoryListItem | null;
}
