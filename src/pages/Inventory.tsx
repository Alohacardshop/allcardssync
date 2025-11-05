import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Search, CheckSquare, Square, Trash2, Printer, Scissors, RotateCcw, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/contexts/StoreContext';
import { Navigation } from '@/components/Navigation';
import { useZebraNetwork } from "@/hooks/useZebraNetwork";
import { ZebraPrinterSelectionDialog } from '@/components/ZebraPrinterSelectionDialog';
import { getTemplate, loadOrgTemplate } from '@/lib/labels/templateStore';
import { zplFromElements, zplFromTemplateString } from '@/lib/labels/zpl';
import { sendZplToPrinter } from '@/lib/labels/print';
import { printQueue } from '@/lib/print/queueInstance';
import type { JobVars, ZPLElement } from '@/lib/labels/types';
import { print } from '@/lib/printService';
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { useBatchSendToShopify } from '@/hooks/useBatchSendToShopify';
import { useShopifyResync } from '@/hooks/useShopifyResync';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadingStateManager } from '@/lib/loading/LoadingStateManager';
import { InventorySkeleton } from '@/components/SmartLoadingSkeleton';
import { InventoryItemCard } from '@/components/InventoryItemCard';
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { InventoryDeleteDialog } from '@/components/InventoryDeleteDialog';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { useCutterSettings } from '@/hooks/useCutterSettings';
import { CutterSettingsPanel } from '@/components/CutterSettingsPanel';
import { RefreshControls } from '@/components/RefreshControls';
import { BulkActionsToolbar } from '@/components/inventory/BulkActionsToolbar';
import { AuthStatusDebug } from '@/components/AuthStatusDebug';
import { useInventoryListQuery } from '@/hooks/useInventoryListQuery';
import { useInventoryItemDetail } from '@/hooks/useInventoryItemDetail';
import { Progress } from '@/components/ui/progress';
import { useQueryClient } from '@tanstack/react-query';

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
  printingItem,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onResync,
  onPrint,
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
  printingItem: string | null;
  onToggleSelection: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onSync: (item: any) => void;
  onRetrySync: (item: any) => void;
  onResync: (item: any) => void;
  onPrint: (item: any) => void;
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
                printingItem={printingItem}
                onToggleSelection={onToggleSelection}
                onToggleExpanded={onToggleExpanded}
                onSync={onSync}
                onRetrySync={onRetrySync}
                onResync={onResync}
                onPrint={onPrint}
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
  const [printStatusFilter, setPrintStatusFilter] = useState<'all' | 'printed' | 'not-printed'>('all');
  const [showSoldItems, setShowSoldItems] = useState(false);
  const [batchFilter, setBatchFilter] = useState<'all' | 'in_batch' | 'removed_from_batch'>(() => {
    return (localStorage.getItem('inventory-batch-filter') as 'all' | 'in_batch' | 'removed_from_batch') || 'all';
  });
  
  // Category tab state
  const [activeTab, setActiveTab] = useState<'raw' | 'graded' | 'raw_comics' | 'graded_comics'>('raw');
  const [comicsSubCategory, setComicsSubCategory] = useState<'graded' | 'raw'>('graded');
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [printingItem, setPrintingItem] = useState<string | null>(null);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Auth and error states
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Dialog state
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<any[]>([]);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [printData, setPrintData] = useState<{ blob: Blob; item: any } | null>(null);
  const [removingFromShopify, setRemovingFromShopify] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);
  
  const { printZPL, selectedPrinter } = useZebraNetwork();
  const { assignedStore, selectedLocation } = useStore();
  const { sendChunkedBatchToShopify, isSending: isBatchSending, progress } = useBatchSendToShopify();
  const { settings: cutterSettings } = useCutterSettings();
  const { resyncAll, resyncSelected, isResyncing } = useShopifyResync();
  const queryClient = useQueryClient();

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
    locationGid: selectedLocation || '',
    activeTab,
    statusFilter,
    batchFilter,
    printStatusFilter,
    comicsSubCategory: null,
    searchTerm: debouncedSearchTerm,
    autoRefreshEnabled,
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

  // Tab prefetching - prefetch adjacent tabs after 2 seconds
  useEffect(() => {
    if (!assignedStore || !selectedLocation) return;

    const timer = setTimeout(() => {
      const prefetchTab = (tab: 'raw' | 'graded' | 'raw_comics' | 'graded_comics') => {
        queryClient.prefetchInfiniteQuery({
          queryKey: [
            'inventory-list',
            assignedStore,
            selectedLocation,
            tab,
            statusFilter,
            batchFilter,
            printStatusFilter,
            null,
            debouncedSearchTerm,
          ],
          queryFn: async () => {
            // Query function will be handled by the hook
            return { items: [], count: 0, nextCursor: undefined };
          },
          initialPageParam: 0,
        });
      };

      // Prefetch adjacent tabs based on current tab
      if (activeTab === 'raw') {
        prefetchTab('graded');
      } else if (activeTab === 'graded') {
        prefetchTab('raw');
        prefetchTab('graded_comics');
      } else if (activeTab === 'raw_comics' || activeTab === 'graded_comics') {
        prefetchTab('graded');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeTab, assignedStore, selectedLocation, statusFilter, batchFilter, printStatusFilter, debouncedSearchTerm, queryClient]);

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

  const handlePrint = useCallback(async (item: any) => {
    const itemType = item.type?.toLowerCase() || 'raw';
    
    // Check if item has printable data (SKU for raw, cert number for graded)
    const hasPrintableData = item.sku || item.psa_cert || item.cgc_cert;
    if (!hasPrintableData) {
      toast.error('No SKU or certificate number available for printing');
      return;
    }

    // Optimistically update printed_at timestamp
    const { previousData } = createOptimisticUpdate(
      [item.id],
      () => ({ printed_at: new Date().toISOString() })
    );

    try {
      setPrintingItem(item.id);
      
      // Helper function to truncate text for labels
      const truncateForLabel = (text: string, maxLength: number = 70): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };

      // Generate proper title for raw card - strip card number if present
      const generateTitle = (item: any) => {
        let name = item.subject || 'Raw Card';
        // Remove card number suffix if present (e.g., "Card Name - 123/456" -> "Card Name")
        if (item.card_number && name.includes(` - ${item.card_number}`)) {
          name = name.replace(` - ${item.card_number}`, '').trim();
        }
        return name;
      };

      // Load the default template (prioritize ZPL Studio templates, then fallback to raw_card_2x1)
      let tpl = null;
      
      // First try to find a default ZPL Studio template
      try {
        const { data: zplTemplates } = await supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'raw')
          .eq('is_default', true)
          .limit(1);
          
          if (zplTemplates && zplTemplates.length > 0) {
          const zplTemplate = zplTemplates[0];
          tpl = {
            id: zplTemplate.id,
            name: zplTemplate.name,
            format: 'zpl_studio' as const,
            zpl: typeof (zplTemplate.canvas as any)?.zplLabel === 'string' 
              ? (zplTemplate.canvas as any).zplLabel 
              : '^XA^FO50,50^A0N,30,30^FD{{CARDNAME}}^FS^FO50,100^A0N,20,20^FD{{CONDITION}}^FS^FO50,150^BY2^BCN,60,Y,N,N^FD{{BARCODE}}^FS^XZ',
            scope: 'org'
          };
            logger.info('ZPL Studio template selected', { templateName: tpl.name });
          }
      } catch (error) {
        logger.warn('Failed to load ZPL Studio template, falling back', error as Error);
      }
      
      // Fallback to regular template system if no ZPL Studio template found
      if (!tpl || !tpl.zpl) {
        tpl = await getTemplate('raw_card_2x1');
      }
      
      if (!tpl) {
        toast.error('No label template available. Please contact administrator.');
        setPrintingItem(null);
        return;
      }

      // Debug: Log the item data being processed
      logger.info('Printing item data', {
        itemId: item.id,
        sku: item.sku,
        subject: item.subject
      });

      // Prepare variables for template substitution
      const vars: JobVars = {
        CARDNAME: generateTitle(item),
        SETNAME: item.brand_title || '',
        CARDNUMBER: item.card_number || '',
        CONDITION: item.condition || 'NM',
        PRICE: item.price ? `$${item.price.toFixed(2)}` : '$0.00',
        SKU: item.sku || '',
        BARCODE: item.psa_cert || item.cgc_cert || item.sku || item.id?.slice(-8) || 'NO-SKU',
      };

      logger.info('Template variables generated', { templateFormat: tpl.format });

      let zpl = '';
      
      // Handle different template formats
      if (tpl.format === 'zpl_studio' && tpl.zpl) {
        logger.info('Processing ZPL Studio template');
        zpl = tpl.zpl;
        
        // Replace ZPL Studio variables with item data
        zpl = zpl
          .replace(/{{CARDNAME}}/g, vars.CARDNAME || 'Unknown Card')
          .replace(/{{SETNAME}}/g, vars.SETNAME || '')
          .replace(/{{CARDNUMBER}}/g, vars.CARDNUMBER || '')
          .replace(/{{CONDITION}}/g, vars.CONDITION || 'NM')
          .replace(/{{PRICE}}/g, vars.PRICE || '$0.00')
          .replace(/{{SKU}}/g, vars.SKU || '')
          .replace(/{{BARCODE}}/g, vars.BARCODE || '');
          
        logger.info('Generated ZPL from ZPL Studio template');
      } else if (tpl.format === 'elements' && tpl.layout) {
        logger.info('Processing elements template');
        const filled = {
          ...tpl.layout,
          elements: tpl.layout.elements.map((el: ZPLElement) => {
            
            if (el.type === 'text') {
              let updatedElement = { ...el };
              let wasUpdated = false;
              
              // Map to correct element IDs from template
              if (el.id === 'cardinfo') {
                updatedElement.text = vars.CARDNAME ?? el.text;
                wasUpdated = true;
              } else if (el.id === 'condition') {
                updatedElement.text = vars.CONDITION ?? el.text;
                wasUpdated = true;
              } else if (el.id === 'price') {
                updatedElement.text = vars.PRICE ?? el.text;
                wasUpdated = true;
              } else if (el.id === 'sku') {
                updatedElement.text = vars.SKU ?? el.text;
                wasUpdated = true;
              } 
              // Legacy fallbacks for older templates
              else if (el.id === 'cardname') {
                updatedElement.text = vars.CARDNAME ?? el.text;
                wasUpdated = true;
              } else if (el.id === 'setname') {
                updatedElement.text = vars.SETNAME ?? el.text;
                wasUpdated = true;
              } else if (el.id === 'cardnumber') {
                updatedElement.text = vars.CARDNUMBER ?? el.text;
                wasUpdated = true;
              }
              
              return updatedElement;
            } else if (el.type === 'barcode' && el.id === 'barcode') {
              const updatedElement = { ...el, data: vars.BARCODE ?? el.data };
              return updatedElement;
            }
            
            return el;
          }),
        };
        zpl = zplFromElements(filled);
        logger.info('Generated ZPL from elements');
      } else if (tpl.format === 'zpl' && tpl.zpl) {
        logger.info('Processing ZPL string template');
        zpl = zplFromTemplateString(tpl.zpl, vars);
        logger.info('Generated ZPL from string template');
      } else {
        logger.error('Invalid template format', new Error('Invalid template format'), { format: tpl.format, hasLayout: !!tpl.layout, hasZpl: !!tpl.zpl });
        throw new Error('Invalid template format');
      }

      // Use the new print queue system with ensurePQ1
      const { sanitizeLabel } = await import('@/lib/print/sanitizeZpl');
      const safeZpl = sanitizeLabel(zpl);
      
      logger.info('Queueing label for printing', {
        template: 'inventory_item',
        qty: item.quantity || 1,
        itemId: item.id
      });
      
      await printQueue.enqueueSafe({ 
        zpl: safeZpl, 
        qty: item.quantity || 1, 
        usePQ: true 
      });
      
      toast.success('Label queued for printing!');
      
      // Update the printed_at timestamp
      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', item.id);
        
      refetch();
    } catch (error) {
      logger.error('Print error', error as Error, { itemId: item.id });
      rollbackOptimisticUpdate(previousData);
      toast.error('Failed to print label: ' + (error as Error).message);
    } finally {
      setPrintingItem(null);
    }
  }, [refetch, createOptimisticUpdate, rollbackOptimisticUpdate]);

  // Helper function to fill template elements with data
  const fillElements = (layout: any, vars: JobVars) => {
    const copy = structuredClone(layout);
    copy.elements = copy.elements.map((el: any) => {
      if (el.type === 'text') {
        if (el.id === 'cardname') el.text = vars.CARDNAME ?? el.text;
        if (el.id === 'condition') el.text = vars.CONDITION ?? el.text;
        if (el.id === 'price') el.text = vars.PRICE ?? el.text;
        if (el.id === 'sku') el.text = vars.SKU ?? el.text;
        if (el.id === 'desc') el.text = `${vars.CARDNAME} • Set • #001`;
      }
      if (el.type === 'barcode' && el.id === 'barcode') {
        el.data = vars.BARCODE ?? el.data;
      }
      return el;
    });
    return copy;
  };

  const handlePrintWithPrinter = useCallback(async (printerId: number) => {
    if (!printData) return;
    
    const item = printData.item;
    const itemType = item.type?.toLowerCase() || 'raw';
    
    // Only allow printing for Raw items
    if (itemType !== 'raw') {
      toast.error('Printing is only available for Raw cards');
      setPrintData(null);
      return;
    }
    
    setPrintingItem(item.id);
    try {
      if (!selectedPrinter) {
        toast.error('No printer selected');
        return;
      }

      // Helper function to truncate text for labels
      const truncateForLabel = (text: string, maxLength: number = 70): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };

      // Generate proper title for raw card - strip card number if present
      const generateTitle = (item: any) => {
        let name = item.subject || 'Raw Card';
        // Remove card number suffix if present (e.g., "Card Name - 123/456" -> "Card Name")
        if (item.card_number && name.includes(` - ${item.card_number}`)) {
          name = name.replace(` - ${item.card_number}`, '').trim();
        }
        return name;
      };

      // Load template and generate ZPL using unified system (prioritize ZPL Studio templates)
      let template = null;
      
      // First try to find a default ZPL Studio template
      try {
        const { data: zplTemplates } = await supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'raw')
          .eq('is_default', true)
          .limit(1);
          
        if (zplTemplates && zplTemplates.length > 0) {
          const zplTemplate = zplTemplates[0];
          template = {
            id: zplTemplate.id,
            name: zplTemplate.name,
            format: 'zpl_studio' as const,
            zpl: typeof (zplTemplate.canvas as any)?.zplLabel === 'string' 
              ? (zplTemplate.canvas as any).zplLabel 
              : '^XA^FO50,50^A0N,30,30^FD{{CARDNAME}}^FS^FO50,100^A0N,20,20^FD{{CONDITION}}^FS^FO50,150^BY2^BCN,60,Y,N,N^FD{{BARCODE}}^FS^XZ',
            scope: 'org'
          };
        }
      } catch (error) {
          console.warn('🖨️ Failed to load ZPL Studio template, falling back:', error);
        }
        
        // Fallback to regular template system
        if (!template || !template.zpl) {
          template = await getTemplate('raw_card_2x1');
        }
        
        const vars: JobVars = {
          CARDNAME: generateTitle(item),
          CONDITION: item.condition || 'NM',
          PRICE: item.price ? `$${item.price.toFixed(2)}` : '$0.00',
          SKU: item.sku || '',
          BARCODE: item.sku || item.id?.slice(-8) || 'NO-SKU',
        };

        const prefs = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');

        let zpl: string;
        
        if (template.format === 'zpl_studio' && template.zpl) {
          logger.info('Processing ZPL Studio template for printer');
        zpl = template.zpl;
        
        // Replace ZPL Studio variables with item data
        zpl = zpl
          .replace(/{{CARDNAME}}/g, vars.CARDNAME || 'Unknown Card')
          .replace(/{{SETNAME}}/g, vars.SETNAME || '')
          .replace(/{{CARDNUMBER}}/g, vars.CARDNUMBER || '')
          .replace(/{{CONDITION}}/g, vars.CONDITION || 'NM')
          .replace(/{{PRICE}}/g, vars.PRICE || '$0.00')
          .replace(/{{SKU}}/g, vars.SKU || '')
          .replace(/{{BARCODE}}/g, vars.BARCODE || '');
      } else if (template.format === 'elements' && template.layout) {
        const filledLayout = fillElements(template.layout, vars);
        zpl = zplFromElements(filledLayout, prefs, cutterSettings);
      } else if (template.format === 'zpl' && template.zpl) {
        zpl = zplFromTemplateString(template.zpl, vars);
      } else {
        throw new Error('No valid template found');
      }

      logger.info('Print with printer: Item details', {
        itemId: item.id,
        quantity: item.quantity,
        sku: item.sku
      });

      // Convert to queue-compatible format - let print queue handle quantity
      const safeZpl = zpl.replace(/\^XZ\s*$/, "").concat("\n^XZ");
      const qty = item.quantity || 1;
      printQueue.enqueue({ zpl: safeZpl, qty, usePQ: true });

      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', item.id);

      toast.success('Raw card label printed successfully');
      refetch();
    } catch (error) {
      logger.error('Print error', error as Error, { itemId: item.id });
      toast.error('Failed to print label');
    } finally {
      setPrintingItem(null);
      setPrintData(null);
    }
  }, [printData, selectedPrinter, refetch, fillElements]);

  const handleSendCutCommand = useCallback(async () => {
    try {
      // Check if PrintNode is configured
      const savedConfig = localStorage.getItem('zebra-printer-config');
      if (!savedConfig) {
        toast.error('No printer configured. Please configure PrintNode in Admin > Test Hardware.');
        return;
      }
      
      const config = JSON.parse(savedConfig);
      if (!config.usePrintNode || !config.printNodeId) {
        toast.error('PrintNode not configured. Please set up PrintNode in Admin > Test Hardware.');
        return;
      }

      // Use the specified immediate cut command
      const cutZpl = '^XA^MMC^CN1^MCY^XZ';
      
      logger.info('Sending cut command to printer', { cutZpl });
      
      const result = await print(cutZpl, 1);
      
      if (result.success) {
        toast.success('Cut command sent successfully');
      } else {
        throw new Error(result.error || 'Cut command failed');
      }
      
    } catch (error) {
      logger.error('Cut command error', error as Error);
      toast.error(`Failed to send cut command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const handleBulkPrintRaw = useCallback(async () => {
    if (bulkPrinting) {
      return;
    }
    
    setBulkPrinting(true);
    
    try {
      // Pre-flight check: Ensure printer is configured
      const { getPrinterConfig } = await import('@/lib/printerConfigService');
      const printerConfig = await getPrinterConfig(assignedStore || undefined, selectedLocation || undefined);
      
      if (!printerConfig || !printerConfig.usePrintNode || !printerConfig.printNodeId) {
        toast.error('No printer configured. Please select a default printer first.');
        setShowPrinterDialog(true);
        return;
      }
      
      // Query database directly for ALL unprinted raw items (ignore UI filters/pagination)
      const query = supabase
        .from('intake_items')
        .select('*')
        .is('printed_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });  // Consistent chronological order
      
      // Add store/location filtering if assigned
      if (assignedStore) {
        query.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        query.eq('shopify_location_gid', selectedLocation);
      }
      
      const { data: allItems, error: fetchError } = await query;
      
      if (fetchError) {
        toast.error(`Failed to fetch items: ${fetchError.message}`);
        return;
      }
      
      // Filter for raw items only (case-insensitive)
      const unprintedRawItems = (allItems || []).filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        return itemType === 'raw';
      });

      if (unprintedRawItems.length === 0) {
        toast.info('No unprinted raw cards found in current store/location');
        return;
      }

      // Show confirmation dialog with count
      const confirmed = window.confirm(
        `Print ${unprintedRawItems.length} unprinted raw card labels?\n\nThis will print ALL unprinted raw cards, not just those visible on the current page.`
      );
      
      if (!confirmed) {
        return;
      }

      logger.info('Bulk print: Processing unprinted raw items', { count: unprintedRawItems.length });

      // Helper function to truncate text for labels
      const truncateForLabel = (text: string, maxLength: number = 70): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };

      // Generate proper title for raw card - strip card number if present
      const generateTitle = (item: any) => {
        let name = item.subject || 'Raw Card';
        // Remove card number suffix if present (e.g., "Card Name - 123/456" -> "Card Name")
        if (item.card_number && name.includes(` - ${item.card_number}`)) {
          name = name.replace(` - ${item.card_number}`, '').trim();
        }
        return name;
      };

      // Load template (prioritize ZPL Studio templates, then fallback to raw_card_2x1) - SAME AS SINGLE PRINT
      let tpl = null;
      
      // First try to find a default ZPL Studio template
      try {
        const { data: zplTemplates } = await supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'raw')
          .eq('is_default', true)
          .limit(1);
          
        if (zplTemplates && zplTemplates.length > 0) {
          const zplTemplate = zplTemplates[0];
          tpl = {
            id: zplTemplate.id,
            name: zplTemplate.name,
            format: 'zpl_studio' as const,
            zpl: typeof (zplTemplate.canvas as any)?.zplLabel === 'string' 
              ? (zplTemplate.canvas as any).zplLabel 
              : '^XA^FO50,50^A0N,30,30^FD{{CARDNAME}}^FS^FO50,100^A0N,20,20^FD{{CONDITION}}^FS^FO50,150^BY2^BCN,60,Y,N,N^FD{{BARCODE}}^FS^XZ',
            scope: 'org'
          };
          logger.info('Bulk print: Using ZPL Studio template', { templateName: tpl.name });
        }
      } catch (error) {
        logger.warn('Bulk print: Failed to load ZPL Studio template, falling back', error as Error);
      }
      
      // Fallback to regular template system if no ZPL Studio template found
      if (!tpl || !tpl.zpl) {
        tpl = await getTemplate('raw_card_2x1');
      }
      
      if (!tpl) {
        toast.error('No label template available. Please contact administrator.');
        setBulkPrinting(false);
        return;
      }

      console.log('[handleBulkPrintRaw] Loaded template:', {
        format: tpl.format,
        hasLayout: !!tpl.layout,
        hasZpl: !!tpl.zpl,
        elementCount: tpl.layout?.elements?.length
      });
      
      const { sanitizeLabel } = await import('@/lib/print/sanitizeZpl');
      let successCount = 0;
      const errors: string[] = [];

      // Process each item individually using the SAME logic as single print
      for (const item of unprintedRawItems) {
        try {
          const vars: JobVars = {
            CARDNAME: generateTitle(item),
            SETNAME: item.brand_title || '',
            CARDNUMBER: item.card_number || '',
            CONDITION: item?.variant ?? 'NM',
            PRICE: item?.price != null ? `$${Number(item.price).toFixed(2)}` : '$0.00',
            SKU: item?.sku ?? '',
            BARCODE: item?.sku ?? item?.id?.slice(-8) ?? 'NO-SKU',
          };
          
          console.log(`[handleBulkPrintRaw] Generating label for SKU ${item.sku}`);

          const prefs = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');

          let zpl = '';
          
          // Handle different template formats - SAME AS SINGLE PRINT
          if (tpl.format === 'zpl_studio' && tpl.zpl) {
            console.log('[handleBulkPrintRaw] Processing ZPL Studio template...');
            zpl = tpl.zpl;
            
            // Replace ZPL Studio variables with item data
            zpl = zpl
              .replace(/{{CARDNAME}}/g, vars.CARDNAME || 'Unknown Card')
              .replace(/{{SETNAME}}/g, vars.SETNAME || '')
              .replace(/{{CARDNUMBER}}/g, vars.CARDNUMBER || '')
              .replace(/{{CONDITION}}/g, vars.CONDITION || 'NM')
              .replace(/{{PRICE}}/g, vars.PRICE || '$0.00')
              .replace(/{{SKU}}/g, vars.SKU || '')
              .replace(/{{BARCODE}}/g, vars.BARCODE || '');
              
          } else if (tpl.format === 'elements' && tpl.layout) {
            console.log('[handleBulkPrintRaw] Processing elements template...');
            const filled = {
              ...tpl.layout,
              elements: tpl.layout.elements.map((el: ZPLElement) => {
                if (el.type === 'text') {
                  let updatedElement = { ...el };
                  
                  // Map to correct element IDs from template (including legacy fallbacks)
                  if (el.id === 'cardinfo') {
                    updatedElement.text = vars.CARDNAME ?? el.text;
                  } else if (el.id === 'condition') {
                    updatedElement.text = vars.CONDITION ?? el.text;
                  } else if (el.id === 'price') {
                    updatedElement.text = vars.PRICE ?? el.text;
                  } else if (el.id === 'sku') {
                    updatedElement.text = vars.SKU ?? el.text;
                  } 
                  // Legacy fallbacks for older templates
                  else if (el.id === 'cardname') {
                    updatedElement.text = vars.CARDNAME ?? el.text;
                  } else if (el.id === 'setname') {
                    updatedElement.text = vars.SETNAME ?? el.text;
                  } else if (el.id === 'cardnumber') {
                    updatedElement.text = vars.CARDNUMBER ?? el.text;
                  } else if (el.id === 'desc') {
                    updatedElement.text = vars.CARDNAME ?? el.text;
                  }
                  
                  return updatedElement;
                } else if (el.type === 'barcode' && el.id === 'barcode') {
                  return { ...el, data: vars.BARCODE ?? el.data };
                }
                return el;
              }),
            };
            zpl = zplFromElements(filled, prefs, cutterSettings);
          } else if (tpl.format === 'zpl' && tpl.zpl) {
            console.log('[handleBulkPrintRaw] Processing ZPL string template...');
            zpl = zplFromTemplateString(tpl.zpl, vars);
          } else {
            throw new Error(`Invalid template format: ${tpl.format}`);
          }

          if (!zpl || zpl.trim().length === 0) {
            throw new Error('Generated ZPL is empty');
          }

          // Use proper ZPL sanitization - SAME AS SINGLE PRINT
          const safeZpl = sanitizeLabel(zpl);
          const qty = item.quantity || 1;
          
          // Use enqueueSafe individually - SAME AS SINGLE PRINT
          await printQueue.enqueueSafe({ 
            zpl: safeZpl, 
            qty, 
            usePQ: true 
          });
          
          successCount++;
          console.log(`[handleBulkPrintRaw] Queued label for ${item.sku} (qty: ${qty})`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`Failed to generate ZPL for ${item.sku}:`, error);
          errors.push(`${item.sku}: ${errorMsg}`);
        }
      }

      if (successCount > 0) {
        // Mark items as printed FIRST to prevent re-queuing
        const printedItemIds = unprintedRawItems.map(item => item.id);
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({ printed_at: new Date().toISOString() })
          .in('id', printedItemIds);
        
        if (updateError) {
          console.error('[handleBulkPrintRaw] Failed to update items:', updateError);
        }
        
        console.log(`[handleBulkPrintRaw] Marked ${printedItemIds.length} items as printed`);
        
        toast.success(`Queued ${successCount} raw card labels for printing`);
        
        // Refresh after a short delay to ensure DB update is visible
        setTimeout(() => {
          refetch();
        }, 500);
      } else {
        console.error('[handleBulkPrintRaw] Failed to generate labels. Errors:', errors);
        toast.error(
          'Failed to generate any labels for printing',
          {
            description: errors.length > 0 ? `First error: ${errors[0]}` : 'Check console for details'
          }
        );
      }
      
    } catch (error) {
      toast.error(`Failed to queue bulk print: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBulkPrinting(false);
    }
  }, [items, refetch, cutterSettings, assignedStore, selectedLocation]);

  const handleCutOnly = useCallback(async () => {
    try {
      const cutZpl = "^XA^MMC^PW420^LL203^XZ";
      printQueue.enqueue({ zpl: cutZpl, qty: 1, usePQ: true });
      toast.success('Cut command sent successfully');
    } catch (error) {
      console.error('Cut command error:', error);
      toast.error(`Failed to send cut command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const handleReprintSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected for reprinting');
      return;
    }

    setBulkPrinting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Preserve selection order
      const selectionOrder = Array.from(selectedItems);
      
      // Fetch fresh data from database to get ALL original information
      const { data: freshItems, error: fetchError } = await supabase
        .from('intake_items')
        .select('*')
        .in('id', selectionOrder);

      if (fetchError) {
        console.error('Failed to fetch items:', fetchError);
        toast.error('Failed to load item data from database');
        setBulkPrinting(false);
        return;
      }

      if (!freshItems || freshItems.length === 0) {
        toast.info('No items found to reprint');
        setBulkPrinting(false);
        return;
      }

      // Create a map for fast lookup
      const itemsMap = new Map(freshItems.map(item => [item.id, item]));
      
      // Sort items to match original selection order and filter for raw items only
      const selectedRawItems = selectionOrder
        .map(id => itemsMap.get(id))
        .filter(item => {
          if (!item) return false;
          const itemType = item.type?.toLowerCase() || 'raw';
          return itemType === 'raw' && !item.deleted_at;
        });

      if (selectedRawItems.length === 0) {
        toast.info('No raw cards selected for reprinting');
        setBulkPrinting(false);
        return;
      }

      console.log(`🖨️ Reprint: Processing ${selectedRawItems.length} items with full database info`);

      // Load template once
      let tpl = null;
      
      try {
        const { data: zplTemplates } = await supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'raw')
          .eq('is_default', true)
          .limit(1);
          
        if (zplTemplates && zplTemplates.length > 0) {
          const zplTemplate = zplTemplates[0];
          tpl = {
            id: zplTemplate.id,
            name: zplTemplate.name,
            format: 'zpl_studio' as const,
            zpl: typeof (zplTemplate.canvas as any)?.zplLabel === 'string' 
              ? (zplTemplate.canvas as any).zplLabel 
              : '^XA^FO50,50^A0N,30,30^FD{{CARDNAME}}^FS^FO50,100^A0N,20,20^FD{{CONDITION}}^FS^FO50,150^BY2^BCN,60,Y,N,N^FD{{BARCODE}}^FS^XZ',
            scope: 'org'
          };
        }
      } catch (error) {
        console.warn('Failed to load ZPL Studio template:', error);
      }
      
      if (!tpl || !tpl.zpl) {
        tpl = await getTemplate('raw_card_2x1');
      }
      
      if (!tpl) {
        toast.error('No label template available');
        setBulkPrinting(false);
        return;
      }

      // Process each item using its ORIGINAL database data
      for (const item of selectedRawItems) {
        try {
          console.log(`🖨️ Reprinting item:`, {
            sku: item.sku,
            subject: item.subject,
            brand_title: item.brand_title,
            card_number: item.card_number,
            grade: item.grade,
            vendor: item.vendor,
            price: item.price
          });

          // Use original subject - strip card number if present
          let cardName = item.subject || 'Raw Card';
          if (item.card_number && cardName.includes(` - ${item.card_number}`)) {
            cardName = cardName.replace(` - ${item.card_number}`, '').trim();
          }

          // Build vars from database fields (including vendor)
          const vars: JobVars = {
            CARDNAME: cardName,
            SETNAME: item.brand_title || '',
            CARDNUMBER: item.card_number || '',
            CONDITION: item.grade || 'NM',
            PRICE: item.price ? `$${item.price.toFixed(2)}` : '$0.00',
            SKU: item.sku || '',
            BARCODE: item.sku || item.id?.slice(-8) || 'NO-SKU',
            VENDOR: item.vendor || '',
            YEAR: item.year || '',
            CATEGORY: item.category || ''
          };

          let zpl = '';
          
          // Generate ZPL based on template format
          if (tpl.format === 'zpl_studio' && tpl.zpl) {
            zpl = tpl.zpl
              .replace(/{{CARDNAME}}/g, vars.CARDNAME || 'Unknown Card')
              .replace(/{{SETNAME}}/g, vars.SETNAME || '')
              .replace(/{{CARDNUMBER}}/g, vars.CARDNUMBER || '')
              .replace(/{{CONDITION}}/g, vars.CONDITION || 'NM')
              .replace(/{{PRICE}}/g, vars.PRICE || '$0.00')
              .replace(/{{SKU}}/g, vars.SKU || '')
              .replace(/{{BARCODE}}/g, vars.BARCODE || '')
              .replace(/{{VENDOR}}/g, vars.VENDOR || '')
              .replace(/{{YEAR}}/g, vars.YEAR || '')
              .replace(/{{CATEGORY}}/g, vars.CATEGORY || '');
          } else if (tpl.format === 'elements' && tpl.layout) {
            const filled = {
              ...tpl.layout,
              elements: tpl.layout.elements.map((el: ZPLElement) => {
                if (el.type === 'text') {
                  const updates: Record<string, string> = {
                    'cardinfo': vars.CARDNAME,
                    'cardname': vars.CARDNAME,
                    'condition': vars.CONDITION,
                    'price': vars.PRICE,
                    'sku': vars.SKU,
                    'setname': vars.SETNAME,
                    'cardnumber': vars.CARDNUMBER,
                    'vendor': vars.VENDOR,
                    'year': vars.YEAR,
                    'category': vars.CATEGORY
                  };
                  if (el.id && updates[el.id]) {
                    return { ...el, text: updates[el.id] };
                  }
                  return el;
                } else if (el.type === 'barcode' && el.id === 'barcode') {
                  return { ...el, data: vars.BARCODE };
                }
                return el;
              }),
            };
            zpl = zplFromElements(filled);
          } else if (tpl.format === 'zpl' && tpl.zpl) {
            zpl = zplFromTemplateString(tpl.zpl, vars);
          } else {
            throw new Error('Invalid template format');
          }

          const { sanitizeLabel } = await import('@/lib/print/sanitizeZpl');
          const safeZpl = sanitizeLabel(zpl);
          
          await printQueue.enqueueSafe({ 
            zpl: safeZpl, 
            qty: 1, 
            usePQ: true 
          });

          successCount++;
        } catch (err) {
          console.error(`Failed to reprint ${item.sku}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} label${successCount > 1 ? 's' : ''} queued for reprinting`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} label${failCount > 1 ? 's' : ''} failed to queue`);
      }
      
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Reprint error:', error);
      toast.error('Failed to reprint selected items');
    } finally {
      setBulkPrinting(false);
    }
  }, [selectedItems]);

  const selectAllVisible = useCallback(() => {
    const allVisibleIds = new Set(filteredItems.map(item => item.id));
    setSelectedItems(allVisibleIds);
  }, [filteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

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

      if (successful > 0) {
        const message = shopifyRemoved > 0 
          ? `Successfully deleted ${successful} item${successful > 1 ? 's' : ''} from inventory (${shopifyRemoved} also removed from Shopify)`
          : `Successfully deleted ${successful} item${successful > 1 ? 's' : ''} from inventory`;
        toast.success(message);
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
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto p-6">
          {/* Auth Debug Panel (only in development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="flex justify-end mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs"
              >
                {showDebug ? 'Hide' : 'Show'} Debug
              </Button>
            </div>
          )}
          
          <AuthStatusDebug visible={showDebug} />
          
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
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Loading indicator for background refetches */}
      {isFetching && !isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <Progress className="h-1 rounded-none" />
        </div>
      )}
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <div className="flex items-center space-x-2">
            {/* Debug Toggle (development only) */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs"
              >
                {showDebug ? 'Hide' : 'Show'} Debug
              </Button>
            )}
            <Suspense fallback={<div className="h-8" />}>
              <QueueStatusIndicator />
            </Suspense>
          </div>
        </div>

        {/* Auth Debug Panel */}
        <AuthStatusDebug visible={showDebug} />

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
              
              {/* Category Tabs */}
              <Card>
                <CardHeader>
                  <CardTitle>Category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="raw">🃏 Raw Cards</TabsTrigger>
                      <TabsTrigger value="graded">⭐ Graded Cards</TabsTrigger>
                      <TabsTrigger value="raw_comics">📚 Raw Comics</TabsTrigger>
                      <TabsTrigger value="graded_comics">📖 Graded Comics</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>
              
              {/* Filters and Search */}
            <Card>
              <CardHeader>
                <CardTitle>Filters & Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
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

                  <Select value={printStatusFilter} onValueChange={(value: any) => setPrintStatusFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Print status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Print Status</SelectItem>
                      <SelectItem value="printed">Printed</SelectItem>
                      <SelectItem value="not-printed">Not Printed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={batchFilter} onValueChange={(value: any) => setBatchFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Batch status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="in_batch">In Batch</SelectItem>
                      <SelectItem value="removed_from_batch">Removed from Batch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Bulk Actions */}
                <BulkActionsToolbar
                  selectedCount={selectedItems.size}
                  totalCount={filteredItems.length}
                  isAdmin={isAdmin}
                  statusFilter={statusFilter}
                  bulkPrinting={bulkPrinting}
                  bulkRetrying={bulkRetrying}
                  bulkSyncing={bulkSyncing}
                  onSelectAll={selectAllVisible}
                  onClearSelection={clearSelection}
                  onBulkPrintRaw={handleBulkPrintRaw}
                  onReprintSelected={handleReprintSelected}
                  onBulkRetrySync={handleBulkRetrySync}
                  onSyncSelected={handleSyncSelected}
                  onResyncSelected={handleResyncSelected}
                  onSendCutCommand={handleSendCutCommand}
                  onDeleteSelected={() => {
                    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
                    setSelectedItemsForDeletion(selectedItemsArray);
                    setShowDeleteDialog(true);
                  }}
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
                        {activeTab === 'graded' 
                          ? 'No graded cards found for this location.'
                          : activeTab === 'raw'
                          ? 'No raw cards found for this location.'
                          : 'No comics found for this location.'}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Store: <strong>{assignedStore}</strong> | Location: <strong>{selectedLocation?.split('/').pop()}</strong>
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
              printingItem={printingItem}
              onToggleSelection={handleToggleSelection}
              onToggleExpanded={handleToggleExpanded}
              onSync={handleSync}
              onRetrySync={handleRetrySync}
              onResync={handleResync}
              onPrint={handlePrint}
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
          
          <TabsContent value="settings">
            <div className="grid gap-6 md:grid-cols-2">
              <CutterSettingsPanel />
              
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    onClick={handleSendCutCommand}
                    className="w-full"
                  >
                    <Scissors className="h-4 w-4 mr-2" />
                    Send Cut Command Now
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Sends an immediate cut command (^XA^MMC^CN1^MCY^XZ) to trigger the cutter without printing a label.
                  </p>
                </CardContent>
              </Card>
            </div>
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

        <ZebraPrinterSelectionDialog
          open={showPrinterDialog}
          onOpenChange={setShowPrinterDialog}
          onPrint={async (printer) => {
            await handlePrintWithPrinter(printer.id);
          }}
          allowDefaultOnly={true}
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
    </div>
  );
};

export default Inventory;