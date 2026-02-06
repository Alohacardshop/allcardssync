import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw, Download, MoreHorizontal, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useStore } from '@/contexts/StoreContext';
import { useShopifyResync } from '@/hooks/useShopifyResync';
import { useEbayListing } from '@/hooks/useEbayListing';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadingStateManager } from '@/lib/loading/LoadingStateManager';
import { InventorySkeleton } from '@/components/SmartLoadingSkeleton';
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { InventoryDeleteDialog } from '@/components/InventoryDeleteDialog';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { PrintFromInventoryDialog } from '@/components/inventory/PrintFromInventoryDialog';
import { KeyboardShortcutsHelp } from '@/components/inventory/KeyboardShortcutsHelp';
import { TruthModeBadge } from '@/components/inventory/TruthModeBadge';
import { Progress } from '@/components/ui/progress';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useInventoryTruthMode } from '@/hooks/useInventoryTruthMode';

import { useInventoryListQuery } from '@/hooks/useInventoryListQuery';
import { useLocationNames } from '@/hooks/useLocationNames';
import { useShopifyTags } from '@/hooks/useShopifyTags';
import { useCategoryFilter, groupCategories } from '@/hooks/useCategoryFilter';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useInventoryRealtime } from '@/hooks/useInventoryRealtime';
import { useCurrentBatch } from '@/hooks/useCurrentBatch';
import { useBatchInventoryLevels } from '@/hooks/useInventoryLevels';

// Feature module imports
import { InventoryFiltersBar } from '../components/InventoryFiltersBar';
import { InventoryCardView } from '../components/InventoryCardView';
import { InventoryTableView } from '../components/InventoryTableView';
import { InventoryViewToggle, type InventoryViewMode } from '../components/InventoryViewToggle';
import { InventoryBulkBar } from '../components/InventoryBulkBar';
import { InspectorPanel } from '../components/inspector/InspectorPanel';
import { useInventorySelection } from '../hooks/useInventorySelection';
import { useInventoryActions } from '../hooks/useInventoryActions';
import type { InventoryFilterState, InventoryListItem } from '../types';
import { ColumnChooser } from '../components/ColumnChooser';
import { SavedViewsDropdown } from '../components/SavedViewsDropdown';
import { CompactStatusStrip } from '../components/CompactStatusStrip';
import { 
  type InventoryColumn, 
  type SortField, 
  type SortDirection,
  type SavedInventoryView
} from '../types/views';
import { getDefaultVisibleColumns } from '../hooks/useInventoryViews';

// Lazy load heavy components
const InventoryAnalytics = lazy(() => import('@/components/InventoryAnalytics').then(m => ({ default: m.InventoryAnalytics })));
const ItemTimeline = lazy(() => import('@/components/ItemTimeline').then(m => ({ default: m.ItemTimeline })));
const QueueStatusIndicator = lazy(() => import('@/components/QueueStatusIndicator').then(m => ({ default: m.QueueStatusIndicator })));

// Workbench-optimized default columns (scan-critical only)
const WORKBENCH_COLUMNS: InventoryColumn[] = [
  'checkbox',
  'sku',
  'title',
  'location',
  'price',
  'quantity',
  'shopify_status',
  'actions',
];

const InventoryPage = () => {
  // Unified loading state management
  const loadingManager = useLoadingStateManager({ pageType: 'inventory' });
  const { snapshot, setPhase, setNextRefreshAt } = loadingManager;

  // Filter state
  const [filters, setFilters] = useState<InventoryFilterState>({
    searchTerm: '',
    statusFilter: 'active',
    typeFilter: 'all',
    categoryFilter: 'all',
    shopifySyncFilter: 'all',
    ebayStatusFilter: 'all',
    printStatusFilter: 'all',
    dateRangeFilter: 'all',
    batchFilter: (localStorage.getItem('inventory-batch-filter') as InventoryFilterState['batchFilter']) || 'all',
    locationFilter: null,
    locationAvailability: 'any',
    tagFilter: [],
    activeQuickFilter: null,
  });

   // Saved Views state (desktop only)
   const [activeViewId, setActiveViewId] = useState<string | null>(null);
   const [visibleColumns, setVisibleColumns] = useState<InventoryColumn[]>(() => 
     WORKBENCH_COLUMNS
   );
   const [sortColumn, setSortColumn] = useState<SortField | null>(null);
   const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
 
  const debouncedSearchTerm = useDebounce(filters.searchTerm, 300);
  
  // Dialog state
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<any[]>([]);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  
  // Inspector panel state - persistent right panel
  const [inspectorItem, setInspectorItem] = useState<InventoryListItem | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // View mode state - default to table on desktop, cards on mobile
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [viewMode, setViewMode] = useState<InventoryViewMode>(() => {
    const saved = localStorage.getItem('inventory-view-mode') as InventoryViewMode | null;
    return saved || 'table';
  });
  
  // Update view mode preference
  const handleViewModeChange = useCallback((mode: InventoryViewMode) => {
    setViewMode(mode);
    localStorage.setItem('inventory-view-mode', mode);
  }, []);

  // Auth and admin states
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  const { assignedStore, selectedLocation } = useStore();
  const { resyncAll, resyncSelected, isResyncing } = useShopifyResync();
  const { bulkToggleEbay } = useEbayListing();
  
  // Fetch truth mode for the current store
  const { mode: truthMode, isShopifyTruth } = useInventoryTruthMode(assignedStore);
  
  // Fetch location names for display
  const { data: locationsMap } = useLocationNames(assignedStore);
  
  // Fetch Shopify tags for filter dropdown
  const { data: shopifyTags = [], isLoading: isLoadingTags } = useShopifyTags(assignedStore);
  
  // Fetch dynamic categories for filter dropdown
  const { data: categories = [], isLoading: isLoadingCategories } = useCategoryFilter(assignedStore);
  const groupedCategories = useMemo(() => groupCategories(categories), [categories]);
  
  // Get user ID for current batch
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    const getUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id);
    };
    getUserId();
  }, []);
  
  const effectiveLocation = filters.locationFilter || selectedLocation;
  
  const { data: currentBatch } = useCurrentBatch({ 
    storeKey: assignedStore, 
    locationGid: effectiveLocation,
    userId 
  });

  // Infinite query for inventory list
  const { 
    data: inventoryData, 
    isLoading, 
    isFetching, 
    error: queryError, 
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInventoryListQuery({
    storeKey: assignedStore || '',
    locationGid: filters.locationFilter,
    categoryFilter: filters.categoryFilter,
    statusFilter: filters.statusFilter,
    batchFilter: filters.batchFilter,
    printStatusFilter: filters.printStatusFilter,
    typeFilter: filters.typeFilter,
    tagFilter: filters.tagFilter,
    searchTerm: debouncedSearchTerm,
    autoRefreshEnabled,
    currentBatchLotId: currentBatch?.items?.[0]?.lot_id,
    shopifySyncFilter: filters.shopifySyncFilter,
    ebayStatusFilter: filters.ebayStatusFilter,
    dateRangeFilter: filters.dateRangeFilter,
    locationAvailability: filters.locationAvailability,
    hasActiveSelection: false,
  });

  // Flatten paginated data
  const items: any[] = useMemo(() => 
    inventoryData?.pages.flatMap(page => page.items) || [], 
    [inventoryData]
  );
  const totalCount = inventoryData?.pages[0]?.count || 0;

  // Fetch batch inventory levels for Shopify-truth quantity display
  const inventoryItemIds = useMemo(() => 
    items.map(item => item.shopify_inventory_item_id).filter(Boolean) as string[],
    [items]
  );
  const { data: inventoryLevelsMap } = useBatchInventoryLevels(inventoryItemIds);

  // Selection hook
  const {
    selectedItems,
    expandedItems,
    toggleSelection,
    toggleExpanded,
    setSelection,
    selectAllVisible,
    clearSelection,
    selectedCount,
  } = useInventorySelection({ items });

  // Actions hook
  const {
    syncingRowId,
    bulkRetrying,
    bulkSyncing,
    removingFromShopify,
    deletingItems,
    handleSync,
    handleRetrySync,
    handleResync,
    handleSyncSelected,
    handleResyncSelected,
    handleBulkRetrySync,
    handleRemoveFromShopify,
    handleDeleteItems,
  } = useInventoryActions({
    selectedLocation,
    selectedItems,
    filteredItems: items,
    isAdmin,
    refetch,
    clearSelection,
  });

  // Check admin role on mount
  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        setPhase('auth', 'loading', { message: 'Checking authentication...' });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.rpc("has_role", { 
            _user_id: user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(data));
          setPhase('auth', 'success');
        } else {
          setPhase('auth', 'error', { message: 'Please sign in to continue' });
        }
      } catch (error) {
        setIsAdmin(false);
        setPhase('auth', 'error', { message: 'Authentication check failed' });
      }
    };
    checkAdminRole();
  }, [setPhase]);

  // Display query errors
  useEffect(() => {
    if (queryError) {
      toast.error('Failed to load inventory: ' + (queryError as Error).message, {
        action: {
          label: 'Retry',
          onClick: () => refetch()
        }
      });
    }
  }, [queryError, refetch]);

  // Persist batch filter preference
  useEffect(() => {
    localStorage.setItem('inventory-batch-filter', filters.batchFilter);
  }, [filters.batchFilter]);

  // Update last refresh when data changes
  useEffect(() => {
    if (inventoryData) {
      setLastRefresh(new Date());
    }
  }, [inventoryData]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setLastRefresh(new Date());
    await refetch();
    toast.success('Inventory refreshed');
  }, [refetch]);

  // Filter change handler
  const handleFilterChange = useCallback(<K extends keyof InventoryFilterState>(
    key: K,
    value: InventoryFilterState[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setFilters({
      searchTerm: '',
      statusFilter: 'active',
      typeFilter: 'all',
      categoryFilter: 'all',
      shopifySyncFilter: 'all',
      ebayStatusFilter: 'all',
      printStatusFilter: 'all',
      dateRangeFilter: 'all',
      batchFilter: 'all',
      locationFilter: null,
      locationAvailability: 'any',
      tagFilter: [],
      activeQuickFilter: null,
    });
     setActiveViewId(null);
  }, []);

   // Apply a saved view
   const handleApplyView = useCallback((view: SavedInventoryView) => {
     setFilters(prev => ({
       ...prev,
       ...view.filters,
       activeQuickFilter: null,
     }));
     
     if (view.visible_columns && view.visible_columns.length > 0) {
       setVisibleColumns(view.visible_columns);
     }
     
     if (view.sort_column) {
       setSortColumn(view.sort_column);
       setSortDirection(view.sort_direction || 'desc');
     }
   }, []);
 
  // Print handler
  const handlePrintSelected = useCallback(() => {
    if (selectedItems.size === 0) {
      toast.info('No items selected for printing');
      return;
    }
    setShowPrintDialog(true);
  }, [selectedItems.size]);

  // Get selected items for print dialog
  const selectedItemsForPrint = useMemo(() => {
    return items.filter(item => selectedItems.has(item.id));
  }, [items, selectedItems]);

  // Search input ref for keyboard navigation
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Store virtualizer scroll function
  const virtualizerScrollToIndexRef = useRef<((index: number) => void) | null>(null);
  const handleSetScrollToIndex = useCallback((fn: (index: number) => void) => {
    virtualizerScrollToIndexRef.current = fn;
  }, []);

  // Handle opening inspector for an item
  const handleOpenInspector = useCallback((item: InventoryListItem) => {
    setInspectorItem(item);
  }, []);

  // Handle inspector navigation
  const handleInspectorNavigate = useCallback((item: InventoryListItem) => {
    setInspectorItem(item);
    // Also scroll table to keep item in view
    const index = items.findIndex(i => i.id === item.id);
    if (index >= 0 && virtualizerScrollToIndexRef.current) {
      virtualizerScrollToIndexRef.current(index);
    }
  }, [items]);

  // Handle printing from inspector
  const handlePrintFromInspector = useCallback((item: InventoryListItem) => {
    if (!selectedItems.has(item.id)) {
      setSelection([item.id], 'replace');
    }
    setShowPrintDialog(true);
  }, [selectedItems, setSelection]);

  // Keyboard navigation
  const { focusedIndex } = useKeyboardNavigation({
    items,
    selectedItems,
    onToggleSelection: toggleSelection,
    onClearSelection: clearSelection,
    onSelectAll: selectAllVisible,
    onSync: handleSyncSelected,
    onPrint: handlePrintSelected,
    onExpandDetails: (itemId: string) => {
      const item = items.find(i => i.id === itemId);
      if (item) handleOpenInspector(item);
    },
    searchInputRef,
    virtualizerScrollToIndex: (index: number) => virtualizerScrollToIndexRef.current?.(index),
    enabled: !showRemovalDialog && !showDeleteDialog && !showPrintDialog,
  });

  // Real-time sync status updates
  useInventoryRealtime({
    storeKey: assignedStore,
    enabled: true,
    onSyncComplete: (itemId, status) => {
      if (status === 'synced') {
        toast.success('Item synced successfully');
      }
    },
  });

  // Show loading states
  const needsLoadingState = snapshot.dominantPhase || 
    !assignedStore || !selectedLocation ||
    (isLoading && !inventoryData);

  if (needsLoadingState) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto p-6">
          <InventorySkeleton
            snapshot={snapshot}
            onRetry={() => refetch()}
            onSignIn={() => window.location.href = '/auth'}
            onApproveRefresh={() => {
              setNextRefreshAt(null);
              refetch();
            }}
            onDismissRefresh={() => {
              setNextRefreshAt(Date.now() + 300000);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Loading indicator for background refetches */}
        {isFetching && !isLoading && (
          <div className="fixed top-0 left-0 right-0 z-50">
            <Progress className="h-0.5 rounded-none" />
          </div>
        )}
        
        {/* Compact Header Row: Title + Tabs + Queue Badge */}
        <div className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Left: Title + Tabs */}
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
              
              <Tabs defaultValue="inventory" className="hidden sm:block">
                <TabsList className="h-8">
                  <TabsTrigger value="inventory" className="text-xs px-3 h-7">Management</TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs px-3 h-7">Analytics</TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs px-3 h-7">Printer</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            {/* Right: Queue status + Truth mode */}
            <div className="flex items-center gap-3">
              {/* Compact Status Strip - desktop only */}
              {isDesktop && (
                <CompactStatusStrip storeKey={assignedStore} />
              )}
              
              <TruthModeBadge mode={truthMode} />
              
              {/* Queue indicator - more subtle */}
              <Suspense fallback={null}>
                <QueueStatusIndicator />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Sticky Controls Bar */}
          <div className="shrink-0 sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
            {/* Single unified controls row */}
            <div className="flex items-center gap-3 py-2">
              {/* Left: Filters */}
              <div className="flex-1 min-w-0">
                <InventoryFiltersBar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onClearAllFilters={handleClearAllFilters}
                  locationsMap={locationsMap}
                  shopifyTags={shopifyTags}
                  isLoadingTags={isLoadingTags}
                  searchInputRef={searchInputRef}
                  categories={categories}
                  groupedCategories={groupedCategories}
                  isLoadingCategories={isLoadingCategories}
                />
              </div>
              
              {/* Right: Actions cluster */}
              <div className="flex items-center gap-2 shrink-0">
                {/* View Toggle - desktop only */}
                {isDesktop && (
                  <InventoryViewToggle
                    mode={viewMode}
                    onChange={handleViewModeChange}
                  />
                )}
                
                {/* Saved Views - desktop only */}
                {isDesktop && (
                  <SavedViewsDropdown
                    currentFilters={filters}
                    currentColumns={visibleColumns}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    activeViewId={activeViewId}
                    onApplyView={handleApplyView}
                    onViewChange={setActiveViewId}
                  />
                )}
                
                {/* Column Chooser - desktop only */}
                {isDesktop && (
                  <ColumnChooser
                    visibleColumns={visibleColumns}
                    onChange={setVisibleColumns}
                  />
                )}
                
                {/* More actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="hidden sm:inline text-xs">More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={() => {
                        if (selectedItems.size > 0) {
                          resyncSelected.mutate({
                            storeKey: assignedStore || '',
                            itemIds: Array.from(selectedItems)
                          });
                        } else {
                          setShowResyncConfirm(true);
                        }
                      }}
                      disabled={isResyncing || !assignedStore || !selectedLocation}
                    >
                      {isResyncing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      {selectedItems.size > 0 
                        ? `Resync Selected (${selectedItems.size})` 
                        : 'Resync All from Shopify'}
                    </DropdownMenuItem>
                    
                    {isDesktop && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => document.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))}>
                          <Keyboard className="h-4 w-4 mr-2" />
                          Keyboard Shortcuts
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Bulk Selection Bar - appears when items selected */}
            {selectedItems.size > 0 && (
              <div className="py-2 border-t border-border bg-muted/30">
                <InventoryBulkBar
                  selectedItems={selectedItems}
                  filteredItems={items}
                  isAdmin={isAdmin}
                  statusFilter={filters.statusFilter}
                  bulkRetrying={bulkRetrying}
                  bulkSyncing={bulkSyncing}
                  onSelectAll={selectAllVisible}
                  onClearSelection={clearSelection}
                  onBulkRetrySync={handleBulkRetrySync}
                  onSyncSelected={handleSyncSelected}
                  onResyncSelected={handleResyncSelected}
                  onDeleteSelected={() => {
                    const selectedItemsArray = items.filter(item => selectedItems.has(item.id));
                    setSelectedItemsForDeletion(selectedItemsArray);
                    setShowDeleteDialog(true);
                  }}
                  onBulkToggleEbay={(enable) => {
                    const selectedIds = Array.from(selectedItems);
                    bulkToggleEbay(selectedIds, enable);
                  }}
                  onPrintSelected={handlePrintSelected}
                  totalCount={totalCount}
                  hasNextPage={hasNextPage}
                />
              </div>
            )}
          </div>

          {/* Workbench: Table + Inspector */}
          <div className="flex-1 overflow-hidden">
            {items.length === 0 && !isLoading ? (
              <div className="flex items-center justify-center p-12 text-center h-full">
                <div className="space-y-4 max-w-md">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">No Items Found</h3>
                    <p className="text-muted-foreground text-sm mb-4">No items match your current filters.</p>
                    <Button variant="outline" size="sm" onClick={handleManualRefresh}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
            ) : isDesktop && viewMode === 'table' ? (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={inspectorItem ? 60 : 100} minSize={40} className="h-full">
                  <InventoryTableView
                    items={items}
                    selectedItems={selectedItems}
                    expandedItems={expandedItems}
                    isAdmin={isAdmin}
                    syncingRowId={syncingRowId}
                    locationsMap={locationsMap}
                    inventoryLevelsMap={inventoryLevelsMap}
                    selectedLocationGid={filters.locationFilter}
                    focusedIndex={focusedIndex}
                    quantityReadOnly={isShopifyTruth}
                    quantityReadOnlyReason="Shopify is source of truth."
                    visibleColumns={visibleColumns}
                    onToggleSelection={toggleSelection}
                    onSetSelection={setSelection}
                    onToggleExpanded={toggleExpanded}
                    onSync={handleSync}
                    onRetrySync={handleRetrySync}
                    onResync={handleResync}
                    onRemove={(item) => { setSelectedItemForRemoval(item); setShowRemovalDialog(true); }}
                    onDelete={isAdmin ? (item) => { setSelectedItemsForDeletion([item]); setShowDeleteDialog(true); } : undefined}
                    onSyncDetails={(item) => setSyncDetailsRow(item)}
                    onOpenDetails={handleOpenInspector}
                    isLoading={snapshot.phases.data === 'loading'}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    onLoadMore={() => fetchNextPage()}
                  />
                </ResizablePanel>
                {inspectorItem && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={40} minSize={25} maxSize={50} className="border-l border-border">
                      <InspectorPanel
                        item={inspectorItem}
                        items={items}
                        locationsMap={locationsMap}
                        onClose={() => setInspectorItem(null)}
                        onNavigate={handleInspectorNavigate}
                        onResync={handleResync}
                        onPrint={handlePrintFromInspector}
                        isResyncing={syncingRowId === inspectorItem?.id}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            ) : (
              <InventoryCardView
                items={items}
                selectedItems={selectedItems}
                expandedItems={expandedItems}
                isAdmin={isAdmin}
                syncingRowId={syncingRowId}
                locationsMap={locationsMap}
                focusedIndex={focusedIndex}
                quantityReadOnly={isShopifyTruth}
                quantityReadOnlyReason="Shopify is source of truth."
                onToggleSelection={toggleSelection}
                onToggleExpanded={toggleExpanded}
                onSync={handleSync}
                onRetrySync={handleRetrySync}
                onResync={handleResync}
                onRemove={(item) => { setSelectedItemForRemoval(item); setShowRemovalDialog(true); }}
                onDelete={isAdmin ? (item) => { setSelectedItemsForDeletion([item]); setShowDeleteDialog(true); } : undefined}
                onSyncDetails={(item) => setSyncDetailsRow(item)}
                isLoading={snapshot.phases.data === 'loading'}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={() => fetchNextPage()}
                onScrollToIndex={handleSetScrollToIndex}
              />
            )}
          </div>
        </div>

        {/* Dialogs */}
        <ShopifyRemovalDialog
          isOpen={showRemovalDialog}
          onClose={() => {
            setShowRemovalDialog(false);
            setSelectedItemForRemoval(null);
          }}
          items={Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : selectedItemForRemoval ? [selectedItemForRemoval] : []}
          loading={removingFromShopify}
          onConfirm={() => handleRemoveFromShopify(selectedItemForRemoval)}
        />

        <ConfirmationDialog
          open={showResyncConfirm}
          onOpenChange={setShowResyncConfirm}
          onConfirm={() => {
            resyncAll.mutate({
              storeKey: assignedStore || '',
              locationGid: selectedLocation || ''
            });
            setShowResyncConfirm(false);
          }}
          title="Resync All Items from Shopify"
          description="This will update your database to match Shopify's current inventory levels for all items at this location. This action cannot be undone."
          confirmText="Resync All"
          cancelText="Cancel"
          icon="sync"
        />

        <InventoryDeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => {
            setShowDeleteDialog(false);
            setSelectedItemsForDeletion([]);
          }}
          items={selectedItemsForDeletion}
          loading={deletingItems}
          onConfirm={() => handleDeleteItems(selectedItemsForDeletion)}
        />

        {syncDetailsRow && (
          <ShopifySyncDetailsDialog
            open={!!syncDetailsRow}
            onOpenChange={(open) => !open && setSyncDetailsRow(null)}
            row={syncDetailsRow}
            selectedStoreKey={assignedStore}
            selectedLocationGid={selectedLocation}
            onRefresh={refetch}
          />
        )}

        <PrintFromInventoryDialog
          open={showPrintDialog}
          onOpenChange={setShowPrintDialog}
          selectedItems={selectedItemsForPrint}
          onPrintComplete={() => {
            refetch();
            clearSelection();
          }}
        />


        {expandedItems.size > 0 && (
          <div className="space-y-4">
            {Array.from(expandedItems).map(itemId => {
              const item = items.find(i => i.id === itemId);
              return item ? (
                <Suspense key={itemId} fallback={<div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
                  <ItemTimeline key={itemId} item={item} />
                </Suspense>
              ) : null;
            })}
          </div>
        )}
        
        {/* Hidden keyboard shortcuts help - triggered via menu */}
        {isDesktop && <KeyboardShortcutsHelp />}
      </div>
    </TooltipProvider>
  );
};

export default InventoryPage;
