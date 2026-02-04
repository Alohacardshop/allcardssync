import React, { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, AlertCircle, RefreshCw, Download, MapPin } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/contexts/StoreContext';
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { useBatchSendToShopify } from '@/hooks/useBatchSendToShopify';
import { useShopifyResync } from '@/hooks/useShopifyResync';
import { useEbayListing } from '@/hooks/useEbayListing';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadingStateManager } from '@/lib/loading/LoadingStateManager';
import { InventorySkeleton } from '@/components/SmartLoadingSkeleton';
import { InventoryItemCard } from '@/components/InventoryItemCard';
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { InventoryDeleteDialog } from '@/components/InventoryDeleteDialog';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { RefreshControls } from '@/components/RefreshControls';
import { CompactRefreshControls } from '@/components/inventory/CompactRefreshControls';
import { BulkActionsToolbar } from '@/components/inventory/BulkActionsToolbar';
import { QuickFilterPresets, QuickFilterState } from '@/components/inventory/QuickFilterPresets';
import { PrintFromInventoryDialog } from '@/components/inventory/PrintFromInventoryDialog';
import { ActiveFilterChips } from '@/components/inventory/ActiveFilterChips';
import { MoreFiltersPopover } from '@/components/inventory/MoreFiltersPopover';
import { PageHeader } from '@/components/layout/PageHeader';

import { useInventoryListQuery } from '@/hooks/useInventoryListQuery';
import { useLocationNames, CachedLocation } from '@/hooks/useLocationNames';
import { useShopifyTags } from '@/hooks/useShopifyTags';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { TagFilterDropdown } from '@/components/inventory/TagFilterDropdown';
import { Progress } from '@/components/ui/progress';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentBatch } from '@/hooks/useCurrentBatch';

// Lazy load heavy components for faster initial render
const InventoryAnalytics = lazy(() => import('@/components/InventoryAnalytics').then(m => ({ default: m.InventoryAnalytics })));
const ItemTimeline = lazy(() => import('@/components/ItemTimeline').then(m => ({ default: m.ItemTimeline })));
const QueueStatusIndicator = lazy(() => import('@/components/QueueStatusIndicator').then(m => ({ default: m.QueueStatusIndicator })));

// Virtual list component with infinite scroll support
const VirtualInventoryList = React.memo(({ 
  items, 
  selectedItems,
  expandedItems,
  isAdmin,
  syncingRowId,
  locationsMap,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore
}: {
  items: any[];
  selectedItems: Set<string>;
  expandedItems: Set<string>;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
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
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  // Intersection observer for infinite scroll
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading inventory...</p>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No items found matching your criteria.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        height: '70vh',
        overflow: 'auto',
      }}
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
                paddingBottom: '1rem',
              }}
            >
              <InventoryItemCard
                item={item}
                isSelected={selectedItems.has(item.id)}
                isExpanded={expandedItems.has(item.id)}
                isAdmin={isAdmin}
                syncingRowId={syncingRowId}
                locationsMap={locationsMap}
                onToggleSelection={onToggleSelection}
                onToggleExpanded={onToggleExpanded}
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
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            ) : (
              <Button 
                variant="outline" 
                onClick={onLoadMore}
                disabled={!hasNextPage}
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

VirtualInventoryList.displayName = 'VirtualInventoryList';

const Inventory = () => {
  // Unified loading state management
  const loadingManager = useLoadingStateManager({ pageType: 'inventory' });
  const { snapshot, setPhase, setMessage, setProgress, setA11yAnnouncement, setNextRefreshAt } = loadingManager;

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors'>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw' | 'graded'>('all');
  const [printStatusFilter, setPrintStatusFilter] = useState<'all' | 'printed' | 'not-printed'>('all');
  
  const [batchFilter, setBatchFilter] = useState<'all' | 'in_batch' | 'removed_from_batch' | 'current_batch'>(() => {
    return (localStorage.getItem('inventory-batch-filter') as 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch') || 'all';
  });
  
  // New unified hub filters
  const [shopifySyncFilter, setShopifySyncFilter] = useState<'all' | 'not-synced' | 'synced' | 'queued' | 'error'>('all');
  const [ebayStatusFilter, setEbayStatusFilter] = useState<'all' | 'not-listed' | 'listed' | 'queued' | 'error'>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  
  // Print dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  
  // Category and location filter state (replaces category tabs)
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'tcg' | 'comics' | 'sealed'>('all');
  const [locationFilter, setLocationFilter] = useState<string | null>(null); // null = all locations
  const [tagFilter, setTagFilter] = useState<string[]>([]); // Shopify tags filter
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // Auth and error states
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Dialog state
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<any[]>([]);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  const [removingFromShopify, setRemovingFromShopify] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);
  
  const { assignedStore, selectedLocation } = useStore();
  const { sendChunkedBatchToShopify, isSending: isBatchSending, progress } = useBatchSendToShopify();
  const { resyncAll, resyncSelected, isResyncing } = useShopifyResync();
  const { bulkToggleEbay } = useEbayListing();
  const queryClient = useQueryClient();
  
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
  
  // Get current active batch - use location filter or fall back to selected location
  const effectiveLocation = locationFilter || selectedLocation;
  
  const { data: currentBatch } = useCurrentBatch({ 
    storeKey: assignedStore, 
    locationGid: effectiveLocation,
    userId 
  });

  // Optimistic update helper for instant UI feedback
  const createOptimisticUpdate = useCallback((
    itemIds: string[],
    updateFn: (item: any) => any
  ) => {
    // Cancel any outgoing refetches
    queryClient.cancelQueries({ queryKey: ['inventory-list'] });
    
    // Snapshot the previous value
    const previousData = queryClient.getQueryData(['inventory-list']);
    
    // Optimistically update the cache
    queryClient.setQueryData(['inventory-list'], (old: any) => {
      if (!old) return old;
      
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          items: page.items.map((item: any) => 
            itemIds.includes(item.id) ? { ...item, ...updateFn(item) } : item
          )
        }))
      };
    });
    
    return { previousData };
  }, [queryClient]);

  // Rollback helper for failed mutations
  const rollbackOptimisticUpdate = useCallback((previousData: any) => {
    if (previousData) {
      queryClient.setQueryData(['inventory-list'], previousData);
    }
  }, [queryClient]);

  // Infinite query for inventory list with minimal columns
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
    locationGid: locationFilter, // null = all locations
    categoryFilter,
    statusFilter,
    batchFilter,
    printStatusFilter,
    typeFilter,
    tagFilter,
    
    searchTerm: debouncedSearchTerm,
    autoRefreshEnabled,
    currentBatchLotId: currentBatch?.items?.[0]?.lot_id,
    shopifySyncFilter,
    ebayStatusFilter,
    dateRangeFilter,
    hasActiveSelection: selectedItems.size > 0, // Smart refresh - pause when selecting
  });

  // Flatten paginated data
  const items = inventoryData?.pages.flatMap(page => page.items) || [];
  const totalCount = inventoryData?.pages[0]?.count || 0;

  // Check admin role on mount and set auth phase
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

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setLastRefresh(new Date());
    await refetch();
    toast.success('Inventory refreshed');
  }, [refetch]);

  // All filtering now handled by database query
  const filteredItems = items;

  // Persist batch filter preference
  useEffect(() => {
    localStorage.setItem('inventory-batch-filter', batchFilter);
  }, [batchFilter]);

  // Update last refresh when data changes
  useEffect(() => {
    if (inventoryData) {
      setLastRefresh(new Date());
    }
  }, [inventoryData]);

  // Tab prefetching - prefetch adjacent categories after 2 seconds
  useEffect(() => {
    if (!assignedStore) return;

    const timer = setTimeout(() => {
      const prefetchCategory = (category: 'all' | 'tcg' | 'comics' | 'sealed') => {
        queryClient.prefetchInfiniteQuery({
          queryKey: [
            'inventory-list',
            assignedStore,
            locationFilter,
            undefined, // activeTab
            category,
            statusFilter,
            batchFilter,
            printStatusFilter,
            typeFilter,
            debouncedSearchTerm,
          ],
          queryFn: async () => {
            // Query function will be handled by the hook
            return { items: [], count: 0, nextCursor: undefined };
          },
          initialPageParam: 0,
        });
      };

      // Prefetch adjacent categories based on current category
      if (categoryFilter === 'all' || categoryFilter === 'tcg') {
        prefetchCategory('comics');
        prefetchCategory('sealed');
      } else if (categoryFilter === 'comics') {
        prefetchCategory('tcg');
      } else if (categoryFilter === 'sealed') {
        prefetchCategory('tcg');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [categoryFilter, assignedStore, locationFilter, statusFilter, batchFilter, printStatusFilter, typeFilter, debouncedSearchTerm, queryClient]);

  // Memoized event handlers
  const handleToggleSelection = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleToggleExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleSync = useCallback(async (item: any) => {
    if (!selectedLocation) { 
      toast.error("Pick a location first"); 
      return;
    }
    
    setSyncingRowId(item.id);
    try {
      // Queue item for Shopify sync
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'update'
      });

      if (queueError) {
        throw new Error(`Failed to queue for sync: ${queueError.message}`);
      }

      // Trigger the processor
      await supabase.functions.invoke('shopify-sync', { body: {} });
      
      toast.success(
        `${item.sku} queued for Shopify sync`, 
        {
          action: {
            label: "View Queue",
            onClick: () => window.location.href = '/admin#queue'
          }
        }
      );
      
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to queue sync");
    } finally {
      setSyncingRowId(null);
    }
  }, [selectedLocation, queryClient]);

  const handleRetrySync = useCallback(async (item: any) => {
    try {
      if (!item.store_key || !item.shopify_location_gid) {
        toast.error('Item is missing store or location data - cannot retry');
        return;
      }
      
      setSyncingRowId(item.id);
      
      // Queue item for retry
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'create'
      });

      if (queueError) {
        throw new Error(`Failed to queue for retry: ${queueError.message}`);
      }

      // Trigger the processor
      await supabase.functions.invoke('shopify-sync', { body: {} });
      
      toast.success(`${item.sku} queued for retry`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error) {
      toast.error('Failed to retry sync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [queryClient]);

  const handleResync = useCallback(async (item: any) => {
    if (!item.store_key || !item.shopify_location_gid) {
      toast.error('Item is missing store or location data');
      return;
    }
    
    if (!item.shopify_product_id) {
      toast.error('Item has no Shopify product ID - use "Sync" instead');
      return;
    }
    
    setSyncingRowId(item.id);
    
    try {
      // Helper to generate barcode for raw cards (TCGPlayer ID only)
      const generateBarcode = (item: any) => {
        return item.catalog_snapshot?.tcgplayer_product_id || item.sku;
      };

      // Use direct send functions with barcode (same as bulk resync)
      if (item.type?.toLowerCase() === 'graded' || item.psa_cert) {
        // Graded card
        const result = await sendGradedToShopify({
          storeKey: item.store_key as "hawaii" | "las_vegas",
          locationGid: item.shopify_location_gid,
          vendor: item.vendor,
          item: {
            id: item.id,
            sku: item.sku,
            psa_cert: item.psa_cert,
            barcode: item.sku, // Use SKU as barcode for graded
            title: item.subject,
            price: item.price,
            grade: item.grade,
            quantity: item.quantity,
            year: item.year,
            brand_title: item.brand_title,
            subject: item.subject,
            card_number: item.card_number
          }
        });

        if (result?.success) {
          toast.success(`${item.sku} resynced to Shopify with barcode`);
        }
      } else {
        // Raw card
        const result = await sendRawToShopify({
          item_id: item.id,
          storeKey: item.store_key as "hawaii" | "las_vegas",
          locationGid: item.shopify_location_gid,
          vendor: item.vendor
        });

        if (result?.success) {
          toast.success(`${item.sku} resynced to Shopify with barcode`);
        }
      }
      
      // Refresh items to show updated status
      refetch();
    } catch (error) {
      logger.error('Resync failed', error as Error, { itemId: item.id, sku: item.sku });
      toast.error('Failed to resync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [refetch]);

  const handleSyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncing) {
      return;
    }

    setBulkSyncing(true);

    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
    const itemsToSync = selectedItemsArray.filter(item => 
      !item.shopify_product_id && item.store_key && item.shopify_location_gid
    );

    if (itemsToSync.length === 0) {
      toast.info('No unsynced items in selection');
      return;
    }

    setBulkSyncing(true);
    try {
      let successCount = 0;
      let failCount = 0;

      for (const item of itemsToSync) {
        try {
          const { error } = await supabase.rpc('queue_shopify_sync', {
            item_id: item.id,
            sync_action: 'create'
          });

          if (error) throw error;
          successCount++;
        } catch (error) {
          logger.error(`Failed to queue ${item.sku}`, error as Error);
          failCount++;
        }
      }

      if (successCount > 0) {
        await supabase.functions.invoke('shopify-sync', { body: {} });
        toast.success(`${successCount} items queued for sync to Shopify`);
      }

      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for sync`);
      }

      refetch();
    } catch (error) {
      toast.error('Failed to start bulk sync');
    } finally {
      setBulkSyncing(false);
    }
  }, [filteredItems, selectedItems, refetch]);

  const handleResyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncing) {
      return;
    }

    setBulkSyncing(true);

    const toastId = toast.loading(`Fetching fresh data for ${selectedItems.size} items...`);
    
    try {
      // Fetch fresh data from database
      const { data: freshItems, error: fetchError } = await supabase
        .from('intake_items')
        .select('*')
        .in('id', Array.from(selectedItems));

      if (fetchError) throw fetchError;

      // Filter to valid items (has store_key, location, sku, not deleted)
      const itemsToResync = freshItems.filter(item => 
        item.store_key && item.shopify_location_gid && item.sku && !item.deleted_at
      );

      logger.info('Starting resync for selected items', {
        selectedCount: selectedItems.size,
        itemsToResyncCount: itemsToResync.length,
        firstItem: itemsToResync[0]?.sku
      });

      if (itemsToResync.length === 0) {
        setBulkSyncing(false);
        toast.dismiss(toastId);
        toast.info('No valid items in selection to resync');
        return;
      }

      // Separate Raw vs Graded items
      const rawItems = itemsToResync.filter(item => 
        item.type?.toLowerCase() === 'raw' && !item.psa_cert
      );
      const gradedItems = itemsToResync.filter(item => 
        item.type?.toLowerCase() === 'graded' || item.psa_cert
      );

      toast.dismiss(toastId);
      const progressToastId = toast.loading(`Resyncing ${itemsToResync.length} items to Shopify...`);

      let created = 0, updated = 0, failed = 0;

      // Helper function to generate barcode for raw cards
      const generateBarcode = (item: any) => {
        const tcgplayerId = item.catalog_snapshot?.tcgplayer_id || item.sku;
        const condition = item.variant || item.grade || 'NM';
        const conditionAbbrev = condition.toLowerCase().includes('near mint') ? 'NM' 
          : condition.toLowerCase().includes('lightly') ? 'LP'
          : condition.toLowerCase().includes('moderately') ? 'MP'
          : condition.toLowerCase().includes('heavily') ? 'HP'
          : condition.toLowerCase().includes('damaged') ? 'DMG'
          : 'NM';
        return `${tcgplayerId}-${conditionAbbrev}`;
      };

      // Process Raw cards
      for (const item of rawItems) {
        try {
          const result = await sendRawToShopify({
            item_id: item.id,
            storeKey: item.store_key as "hawaii" | "las_vegas",
            locationGid: item.shopify_location_gid,
            vendor: item.vendor
          });
          
          if (result?.success) {
            if (result.created) created++;
            else if (result.adjusted) updated++;
          }
        } catch (error) {
          logger.error(`Failed to resync raw item ${item.sku}`, error as Error);
          failed++;
        }
      }

      // Process Graded cards
      for (const item of gradedItems) {
        try {
          const result = await sendGradedToShopify({
            storeKey: item.store_key as "hawaii" | "las_vegas",
            locationGid: item.shopify_location_gid,
            vendor: item.vendor,
            item: {
              id: item.id,
              sku: item.sku,
              psa_cert: item.psa_cert,
              barcode: item.sku,
              title: item.subject,
              price: item.price,
              grade: item.grade,
              quantity: item.quantity,
              year: item.year,
              brand_title: item.brand_title,
              subject: item.subject,
              card_number: item.card_number,
              variant: item.variant,
              category_tag: item.category,
              image_url: item.image_urls?.[0],
              cost: item.cost
            }
          });
          
          if (result?.success) {
            created++;
          }
        } catch (error) {
          logger.error(`Failed to resync graded item ${item.sku}`, error as Error);
          failed++;
        }
      }

      toast.dismiss(progressToastId);

      // Show results
      if (created > 0 || updated > 0) {
        toast.success(
          `Resync complete: ${created} created, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}`
        );
      } else if (failed > 0) {
        toast.error(`Resync failed for ${failed} items`);
      }

      // Refresh in background (non-blocking)
      refetch();
    } catch (error) {
      toast.dismiss(toastId);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to start bulk resync', {
        description: errorMessage
      });
    } finally {
      setBulkSyncing(false);
    }
  }, [selectedItems, refetch]);

  const handleBulkRetrySync = useCallback(async () => {
    const errorItems = filteredItems.filter(item => 
      selectedItems.has(item.id) && 
      item.shopify_sync_status === 'error' &&
      item.store_key && 
      item.shopify_location_gid
    );
    
    if (errorItems.length === 0) {
      toast.error('No selected items with sync errors found');
      return;
    }

    setBulkRetrying(true);
    try {
      let successCount = 0;
      let failCount = 0;

      // Queue each item for retry
      for (const item of errorItems) {
        try {
          const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
            item_id: item.id,
            sync_action: 'create'
          });

          if (queueError) {
            logger.error(`Failed to queue ${item.sku}`, queueError as Error);
            failCount++;
          } else {
            successCount++;
          }
          
          // Small delay between queue operations
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error queuing ${item.sku}`, error as Error);
          failCount++;
        }
      }

      if (successCount > 0) {
        // Trigger the processor
        await supabase.functions.invoke('shopify-sync', { body: {} });
        toast.success(`${successCount} items queued for retry sync`);
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue for retry`);
      }

      refetch();
    } catch (error) {
      toast.error('Failed to start bulk retry');
    } finally {
      setBulkRetrying(false);
    }
  }, [filteredItems, selectedItems, refetch]);


  const selectAllVisible = useCallback(() => {
    const allVisibleIds = new Set(filteredItems.map(item => item.id));
    setSelectedItems(allVisibleIds);
  }, [filteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // Search input ref for keyboard navigation
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation hook
  useKeyboardNavigation({
    items: filteredItems,
    selectedItems,
    onToggleSelection: handleToggleSelection,
    onClearSelection: clearSelection,
    onSelectAll: selectAllVisible,
    onSync: handleSyncSelected,
    searchInputRef,
    enabled: !showRemovalDialog && !showDeleteDialog && !showPrintDialog,
  });

  // Quick filter preset handler
  const handleApplyQuickFilter = useCallback((preset: Partial<QuickFilterState>) => {
    // Set individual filter states from preset
    if (preset.shopifySyncFilter) setShopifySyncFilter(preset.shopifySyncFilter);
    if (preset.ebayStatusFilter) setEbayStatusFilter(preset.ebayStatusFilter);
    if (preset.printStatusFilter) setPrintStatusFilter(preset.printStatusFilter);
    if (preset.dateRangeFilter) setDateRangeFilter(preset.dateRangeFilter);
    if (preset.statusFilter) setStatusFilter(preset.statusFilter);
    if (preset.categoryFilter) setCategoryFilter(preset.categoryFilter);
    
    // Determine which preset was applied for highlighting
    if (preset.shopifySyncFilter === 'not-synced') setActiveQuickFilter('ready-to-sync');
    else if (preset.statusFilter === 'errors') setActiveQuickFilter('sync-errors');
    else if (preset.printStatusFilter === 'not-printed') setActiveQuickFilter('needs-barcode');
    else if (preset.ebayStatusFilter === 'not-listed') setActiveQuickFilter('not-on-ebay');
    else if (preset.categoryFilter === 'sealed') setActiveQuickFilter('sealed-products');
    else if (preset.shopifySyncFilter === 'synced') setActiveQuickFilter('on-shopify');
    else if (preset.shopifySyncFilter === 'queued') setActiveQuickFilter('shopify-queued');
    else if (preset.dateRangeFilter === 'today') setActiveQuickFilter('todays-intake');
    else setActiveQuickFilter(null);
  }, []);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setStatusFilter('active');
    setShopifySyncFilter('all');
    setEbayStatusFilter('all');
    setPrintStatusFilter('all');
    setDateRangeFilter('all');
    setBatchFilter('all');
    setTypeFilter('all');
    setCategoryFilter('all');
    setLocationFilter(null);
    setSearchTerm('');
    setActiveQuickFilter(null);
  }, []);

  // Print selected items handler
  const handlePrintSelected = useCallback(() => {
    if (selectedItems.size === 0) {
      toast.info('No items selected for printing');
      return;
    }
    setShowPrintDialog(true);
  }, [selectedItems.size]);

  // Get selected items for print dialog
  const selectedItemsForPrint = useMemo(() => {
    return filteredItems.filter(item => selectedItems.has(item.id));
  }, [filteredItems, selectedItems]);

  const handleRemoveFromShopify = useCallback(async (mode: 'delete') => {
    if (!selectedItemForRemoval) return;
    
    setRemovingFromShopify(true);
    const items = Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : [selectedItemForRemoval];
    
    try {
      const results = await Promise.allSettled(
        items.map(async (item) => {
          // Determine item type for appropriate edge function
          const itemType = item.type || (item.psa_cert || item.grade ? 'Graded' : 'Raw');
          const functionName = itemType === 'Graded' ? 'v2-shopify-remove-graded' : 'v2-shopify-remove-raw';
          
          // Call the appropriate Shopify removal edge function
          const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
              storeKey: item.store_key,
              productId: item.shopify_product_id,
              sku: item.sku,
              locationGid: item.shopify_location_gid,
              itemId: item.id,
              certNumber: item.psa_cert,
              quantity: 1
            }
          });

          if (error) {
            throw new Error(`Failed to remove ${item.sku}: ${error.message}`);
          }

          if (!data?.ok) {
            throw new Error(`Failed to remove ${item.sku}: ${data?.error || 'Unknown error'}`);
          }

          // Update local database to mark as deleted
          const { error: updateError } = await supabase
            .from('intake_items')
            .update({ 
              deleted_at: new Date().toISOString(),
              deleted_reason: 'Removed from Shopify via inventory management',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          if (updateError) {
            console.error('Failed to update local database:', updateError);
            // Don't throw here as Shopify removal was successful
          }

          return item;
        })
      );

      // Process results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      if (successful > 0) {
        toast.success(
          `Successfully removed ${successful} item${successful > 1 ? 's' : ''} from Shopify`
        );
      }

      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(`Failed to remove ${failed.length} item${failed.length > 1 ? 's' : ''}: ${firstError.message}`);
      }

      // Refresh inventory
      refetch();
      
    } catch (error: any) {
      console.error('Error removing from Shopify:', error);
      toast.error(`Failed to remove items: ${error.message}`);
    } finally {
      setRemovingFromShopify(false);
      setShowRemovalDialog(false);
      setSelectedItemForRemoval(null);
    }
  }, [selectedItemForRemoval, refetch]);

  // New comprehensive delete handler for admins
  const handleDeleteItems = useCallback(async (items: any[]) => {
    if (!isAdmin) {
      toast.error('Only admins can delete inventory items');
      return;
    }

    // Optimistically mark items as deleted
    const itemIds = items.map(item => item.id);
    const { previousData } = createOptimisticUpdate(
      itemIds,
      () => ({ 
        deleted_at: new Date().toISOString(),
        deleted_reason: 'Admin deleted'
      })
    );

    setDeletingItems(true);
    
    try {
      const results = await Promise.allSettled(
        items.map(async (item) => {
          // Check if item is synced to Shopify and not pending
          const isSyncedToShopify = item.shopify_product_id && 
                                    item.shopify_sync_status === 'synced';

          if (isSyncedToShopify) {
            // Remove from Shopify first
            const itemType = item.type || (item.psa_cert || item.grade ? 'Graded' : 'Raw');
            const functionName = itemType === 'Graded' ? 'v2-shopify-remove-graded' : 'v2-shopify-remove-raw';
            
            const { data, error } = await supabase.functions.invoke(functionName, {
              body: {
                storeKey: item.store_key,
                productId: item.shopify_product_id,
                sku: item.sku,
                locationGid: item.shopify_location_gid,
                itemId: item.id,
                certNumber: item.psa_cert,
                quantity: 1
              }
            });

            if (error) {
              throw new Error(`Failed to remove ${item.sku} from Shopify: ${error.message}`);
            }

            if (!data?.ok) {
              throw new Error(`Failed to remove ${item.sku} from Shopify: ${data?.error || 'Unknown error'}`);
            }
          }

          // Soft delete from inventory
          const { error: deleteError } = await supabase
            .from('intake_items')
            .update({ 
              deleted_at: new Date().toISOString(),
              deleted_reason: isSyncedToShopify 
                ? 'Admin deleted - removed from Shopify and inventory'
                : 'Admin deleted from inventory',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          if (deleteError) {
            throw new Error(`Failed to delete ${item.sku} from inventory: ${deleteError.message}`);
          }

          return { item, removedFromShopify: isSyncedToShopify };
        })
      );

      // Process results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');
      const shopifyRemoved = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(r => r.removedFromShopify).length;

      // Capture item IDs for undo before clearing
      const deletedItemIds = selectedItemsForDeletion.map(item => item.id);
      
      if (successful > 0) {
        const message = shopifyRemoved > 0 
          ? `Deleted ${successful} item${successful > 1 ? 's' : ''} (${shopifyRemoved} from Shopify)`
          : `Deleted ${successful} item${successful > 1 ? 's' : ''}`;
        
        toast.success(message, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                // Restore soft-deleted items
                const { error } = await supabase
                  .from('intake_items')
                  .update({ 
                    deleted_at: null, 
                    deleted_reason: null,
                    updated_at: new Date().toISOString()
                  })
                  .in('id', deletedItemIds);
                
                if (error) throw error;
                
                toast.success('Items restored');
                refetch();
              } catch (error: any) {
                toast.error('Failed to restore items: ' + error.message);
              }
            },
          },
          duration: 8000, // Longer duration to give time to undo
        });
      }

      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(`Failed to delete ${failed.length} item${failed.length > 1 ? 's' : ''}: ${firstError.message}`);
      }

      // Refresh inventory
      refetch();
      clearSelection();
      
    } catch (error: any) {
      console.error('Error deleting items:', error);
      rollbackOptimisticUpdate(previousData);
      toast.error(`Failed to delete items: ${error.message}`);
    } finally {
      setDeletingItems(false);
      setShowDeleteDialog(false);
      setSelectedItemsForDeletion([]);
    }
  }, [isAdmin, refetch, clearSelection, createOptimisticUpdate, rollbackOptimisticUpdate]);

  // Show loading states based on unified loading manager
  const needsLoadingState = snapshot.dominantPhase || 
    !assignedStore || !selectedLocation ||
    (isLoading && !inventoryData);

  if (needsLoadingState) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto p-6">
          <InventorySkeleton
            snapshot={snapshot}
            onRetry={() => {
              refetch();
            }}
            onSignIn={() => window.location.href = '/auth'}
            onApproveRefresh={() => {
              setNextRefreshAt(null);
              refetch();
            }}
            onDismissRefresh={() => {
              setNextRefreshAt(Date.now() + 300000); // Snooze for 5 minutes
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Loading indicator for background refetches */}
      {isFetching && !isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <Progress className="h-1 rounded-none" />
        </div>
      )}
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

            <TabsContent value="inventory" className="space-y-6">
              {/* Refresh Controls */}
              <div className="flex items-center gap-2">
                <RefreshControls
                  autoRefreshEnabled={autoRefreshEnabled}
                  onAutoRefreshToggle={setAutoRefreshEnabled}
                  onManualRefresh={handleManualRefresh}
                  isRefreshing={isFetching}
                  lastRefresh={lastRefresh}
                />
                
                {/* Resync from Shopify Dropdown */}
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
                </div>
              </div>
              
              {/* Quick Filter Presets - now at the top for primary navigation */}
              <Card>
                <CardContent className="py-4">
                  <QuickFilterPresets
                    onApplyPreset={handleApplyQuickFilter}
                    onClearFilters={handleClearAllFilters}
                    activePreset={activeQuickFilter}
                  />
                </CardContent>
              </Card>
              
              {/* Filters and Search */}
            <Card>
              <CardHeader>
                <CardTitle>Filters & Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Row 1: Search and Core Filters */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search items... (press / to focus)"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <Select value={statusFilter} onValueChange={(value: any) => { setStatusFilter(value); setActiveQuickFilter(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="errors">Errors</SelectItem>
                      <SelectItem value="deleted">Deleted</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Item type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="raw">Raw Only</SelectItem>
                      <SelectItem value="graded">Graded Only</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* New Category Filter */}
                  <Select value={categoryFilter} onValueChange={(value: any) => setCategoryFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="tcg">🎴 TCG Cards</SelectItem>
                      <SelectItem value="comics">📚 Comics</SelectItem>
                      <SelectItem value="sealed">📦 Sealed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 2: Location, Marketplace and Print Filters */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  {/* Location Filter */}
                  <Select 
                    value={locationFilter || 'all'} 
                    onValueChange={(value: string) => setLocationFilter(value === 'all' ? null : value)}
                  >
                    <SelectTrigger>
                      <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locationsMap && Array.from(locationsMap.values()).map(loc => (
                        <SelectItem key={loc.location_gid} value={loc.location_gid}>
                          {loc.location_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={shopifySyncFilter} onValueChange={(value: any) => { setShopifySyncFilter(value); setActiveQuickFilter(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Shopify Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shopify</SelectItem>
                      <SelectItem value="not-synced">Not Synced</SelectItem>
                      <SelectItem value="synced">Synced</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="error">Sync Error</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={ebayStatusFilter} onValueChange={(value: any) => { setEbayStatusFilter(value); setActiveQuickFilter(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="eBay Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All eBay</SelectItem>
                      <SelectItem value="not-listed">Not Listed</SelectItem>
                      <SelectItem value="listed">Listed</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={printStatusFilter} onValueChange={(value: any) => { setPrintStatusFilter(value); setActiveQuickFilter(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Print status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Print Status</SelectItem>
                      <SelectItem value="printed">Printed</SelectItem>
                      <SelectItem value="not-printed">Not Printed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={dateRangeFilter} onValueChange={(value: any) => { setDateRangeFilter(value); setActiveQuickFilter(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Date Added" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="7days">Last 7 Days</SelectItem>
                      <SelectItem value="30days">Last 30 Days</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={batchFilter} onValueChange={(value: any) => setBatchFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Batch status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="current_batch">Current Batch {currentBatch?.items?.[0]?.lot_number && `(${currentBatch.items[0].lot_number})`}</SelectItem>
                      <SelectItem value="in_batch">In Any Batch</SelectItem>
                      <SelectItem value="removed_from_batch">Removed from Batch</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Shopify Tags Filter */}
                  <TagFilterDropdown
                    tags={shopifyTags}
                    selectedTags={tagFilter}
                    onTagsChange={setTagFilter}
                    isLoading={isLoadingTags}
                  />
                </div>

                {/* Bulk Actions */}
                <BulkActionsToolbar
                  selectedCount={selectedItems.size}
                  totalCount={filteredItems.length}
                  isAdmin={isAdmin}
                  statusFilter={statusFilter}
                  bulkRetrying={bulkRetrying}
                  bulkSyncing={bulkSyncing}
                  onSelectAll={selectAllVisible}
                  onClearSelection={clearSelection}
                  onBulkRetrySync={handleBulkRetrySync}
                  onSyncSelected={handleSyncSelected}
                  onResyncSelected={handleResyncSelected}
                  onDeleteSelected={() => {
                    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
                    setSelectedItemsForDeletion(selectedItemsArray);
                    setShowDeleteDialog(true);
                  }}
                  onBulkToggleEbay={(enable) => {
                    const selectedIds = Array.from(selectedItems);
                    bulkToggleEbay(selectedIds, enable);
                  }}
                  onPrintSelected={handlePrintSelected}
                />

                <div className="text-sm text-muted-foreground">
                  Showing {filteredItems.length} items {totalCount > filteredItems.length && `(${totalCount} total)`}
                  {hasNextPage && ' • Scroll to load more'}
                </div>
              </CardContent>
            </Card>

            {/* Empty state when no items match filters */}
            {!isLoading && filteredItems.length === 0 && (
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
                        {locationFilter && <> | Location: <strong>{locationsMap?.get(locationFilter)?.location_name || locationFilter.split('/').pop()}</strong></>}
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

            {/* Virtual Scrolling Items List */}
            {filteredItems.length > 0 && (
              <VirtualInventoryList
              items={filteredItems}
              selectedItems={selectedItems}
              expandedItems={expandedItems}
              isAdmin={isAdmin}
              syncingRowId={syncingRowId}
              locationsMap={locationsMap}
              onToggleSelection={handleToggleSelection}
              onToggleExpanded={handleToggleExpanded}
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
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <InventoryAnalytics />
            </Suspense>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <ShopifyRemovalDialog
          isOpen={showRemovalDialog}
          onClose={() => {
            setShowRemovalDialog(false);
            setSelectedItemForRemoval(null);
          }}
          items={Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : selectedItemForRemoval ? [selectedItemForRemoval] : []}
          loading={removingFromShopify}
          onConfirm={handleRemoveFromShopify}
        />

        {/* Resync All Confirmation Dialog */}
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

        {/* Print From Inventory Dialog */}
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

export default Inventory;