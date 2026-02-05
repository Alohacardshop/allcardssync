import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { Progress } from '@/components/ui/progress';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useInventoryTruthMode } from '@/hooks/useInventoryTruthMode';

import { useInventoryListQuery } from '@/hooks/useInventoryListQuery';
import { useLocationNames } from '@/hooks/useLocationNames';
import { useShopifyTags } from '@/hooks/useShopifyTags';
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
import { useInventorySelection } from '../hooks/useInventorySelection';
import { useInventoryActions } from '../hooks/useInventoryActions';
import type { InventoryFilterState } from '../types';

// Lazy load heavy components
const InventoryAnalytics = lazy(() => import('@/components/InventoryAnalytics').then(m => ({ default: m.InventoryAnalytics })));
const ItemTimeline = lazy(() => import('@/components/ItemTimeline').then(m => ({ default: m.ItemTimeline })));
const QueueStatusIndicator = lazy(() => import('@/components/QueueStatusIndicator').then(m => ({ default: m.QueueStatusIndicator })));

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

  const debouncedSearchTerm = useDebounce(filters.searchTerm, 300);
  
  // Dialog state
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<any[]>([]);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  
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
    hasActiveSelection: false, // Will be updated by selection hook
  });

  // Flatten paginated data - use any[] for dynamic query results
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

  // Handle opening details for an item
  const handleOpenDetails = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      setSyncDetailsRow(item);
    }
  }, [items]);

  // Keyboard navigation
  const { focusedIndex } = useKeyboardNavigation({
    items,
    selectedItems,
    onToggleSelection: toggleSelection,
    onClearSelection: clearSelection,
    onSelectAll: selectAllVisible,
    onSync: handleSyncSelected,
    onPrint: handlePrintSelected,
    onExpandDetails: handleOpenDetails,
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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Loading indicator for background refetches */}
      {isFetching && !isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <Progress className="h-1 rounded-none" />
        </div>
      )}
      
      {/* Sticky Header Section */}
      <div className="shrink-0 space-y-4 pb-4">
        <PageHeader 
          title="Inventory Management" 
          description="View, search, and manage your inventory items"
          showEcosystem
          actions={
            <Suspense fallback={<div className="h-8" />}>
              <QueueStatusIndicator />
            </Suspense>
          }
        />

        <Tabs defaultValue="inventory" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inventory">Inventory Management</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Printer Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Single Sticky Controls Stack - all sticky elements in one container */}
        <div className="shrink-0 sticky top-0 z-20 bg-background border-b border-border">
          {/* View Toggle + Truth Mode */}
          <div className="flex items-center gap-2 flex-wrap py-2">
            {/* Truth Mode Badge */}
            <TruthModeBadge mode={truthMode} prominent />
            
            {/* View Toggle - only show on desktop */}
            {isDesktop && (
              <InventoryViewToggle
                mode={viewMode}
                onChange={handleViewModeChange}
              />
            )}
            
            {/* Resync from Shopify */}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
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
              </Button>
              
              {/* Keyboard shortcuts help */}
              {isDesktop && <KeyboardShortcutsHelp />}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="pb-3">
            <InventoryFiltersBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearAllFilters={handleClearAllFilters}
              locationsMap={locationsMap}
              shopifyTags={shopifyTags}
              isLoadingTags={isLoadingTags}
              searchInputRef={searchInputRef}
            />
          </div>

          {/* Bulk Bar - conditionally rendered within sticky stack */}
          {selectedItems.size > 0 && (
            <div className="py-2 border-t border-border">
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

        {/* Scrollable List Area */}
        <div className="flex-1 overflow-auto pt-4">
          {/* Empty state */}
          {!isLoading && items.length === 0 && (
            <Card>
              <CardContent className="flex items-center justify-center p-12 text-center">
                <div className="space-y-4">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">No Items Found</h3>
                    <p className="text-muted-foreground mb-4">
                      No items match your current filters.
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Store: <strong>{assignedStore}</strong>
                      {filters.locationFilter && <> | Location: <strong>{locationsMap?.get(filters.locationFilter)?.location_name || filters.locationFilter.split('/').pop()}</strong></>}
                    </p>
                    <Button variant="outline" onClick={handleManualRefresh}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Virtual Scrolling Items List - Card or Table view */}
          {items.length > 0 && (
            isDesktop && viewMode === 'table' ? (
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
                quantityReadOnlyReason="Shopify is source of truth. Use Receiving or Transfer to adjust."
                onToggleSelection={toggleSelection}
                onSetSelection={setSelection}
                onToggleExpanded={toggleExpanded}
                onSync={handleSync}
                onRetrySync={handleRetrySync}
                onResync={handleResync}
                onRemove={(item) => {
                  setSelectedItemForRemoval(item);
                  setShowRemovalDialog(true);
                }}
                onDelete={isAdmin ? (item) => {
                  setSelectedItemsForDeletion([item]);
                  setShowDeleteDialog(true);
                } : undefined}
                onSyncDetails={(item) => setSyncDetailsRow(item)}
                isLoading={snapshot.phases.data === 'loading'}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={() => fetchNextPage()}
              />
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
                quantityReadOnlyReason="Shopify is source of truth. Use Receiving or Transfer to adjust."
                onToggleSelection={toggleSelection}
                onToggleExpanded={toggleExpanded}
                onSync={handleSync}
                onRetrySync={handleRetrySync}
                onResync={handleResync}
                onRemove={(item) => {
                  setSelectedItemForRemoval(item);
                  setShowRemovalDialog(true);
                }}
                onDelete={isAdmin ? (item) => {
                  setSelectedItemsForDeletion([item]);
                  setShowDeleteDialog(true);
                } : undefined}
                onSyncDetails={(item) => setSyncDetailsRow(item)}
                isLoading={snapshot.phases.data === 'loading'}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={() => fetchNextPage()}
                onScrollToIndex={handleSetScrollToIndex}
              />
            )
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
    </div>
  );
};

export default InventoryPage;
