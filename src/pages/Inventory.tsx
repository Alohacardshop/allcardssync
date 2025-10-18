import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Search, CheckSquare, Square, Trash2, Printer, Scissors, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InventoryAnalytics } from '@/components/InventoryAnalytics';
import { ItemTimeline } from '@/components/ItemTimeline';
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
import { useDebounce } from '@/hooks/useDebounce';
import { useStablePolling } from '@/hooks/useStablePolling';
import { useLoadingStateManager } from '@/lib/loading/LoadingStateManager';
import { InventorySkeleton } from '@/components/SmartLoadingSkeleton';
import { classifyError } from '@/lib/loading/errorClassifier';
import { shouldRefetch } from '@/lib/loading/refreshPolicy';
import { useLoadingMetrics, incrementRefresh, incrementDismissedRefresh } from '@/lib/loading/metrics';
import { InventoryItemCard } from '@/components/InventoryItemCard';
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { QueueStatusIndicator } from '@/components/QueueStatusIndicator';
import { InventoryDeleteDialog } from '@/components/InventoryDeleteDialog';
import { useCutterSettings } from '@/hooks/useCutterSettings';
import { CutterSettingsPanel } from '@/components/CutterSettingsPanel';
import { TestLabelButton } from '@/components/TestLabelButton';
import { RefreshControls } from '@/components/RefreshControls';
import { AuthStatusDebug } from '@/components/AuthStatusDebug';

const ITEMS_PER_PAGE = 50;

const Inventory = () => {
  // Unified loading state management
  const loadingManager = useLoadingStateManager({ pageType: 'inventory' });
  const { snapshot, setPhase, setMessage, setProgress, setA11yAnnouncement, setNextRefreshAt } = loadingManager;
  const metrics = useLoadingMetrics('inventory');

  // Core state
  const [items, setItems] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'sold' | 'deleted' | 'errors'>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [printStatusFilter, setPrintStatusFilter] = useState<'all' | 'printed' | 'not-printed'>('all');
  const [showSoldItems, setShowSoldItems] = useState(false);
  const [batchFilter, setBatchFilter] = useState<'all' | 'in_batch' | 'removed_from_batch'>(() => {
    return (localStorage.getItem('inventory-batch-filter') as 'all' | 'in_batch' | 'removed_from_batch') || 'all';
  });
  
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
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<any[]>([]);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [printData, setPrintData] = useState<{ blob: Blob; item: any } | null>(null);
  const [removingFromShopify, setRemovingFromShopify] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);
  
  // Refs to prevent concurrent operations more reliably than state
  const bulkPrintingRef = useState(false)[0];
  const bulkRetryingRef = useState(false)[0];
  const bulkSyncingRef = useState(false)[0];
  
  const { printZPL, selectedPrinter } = useZebraNetwork();
  const { assignedStore, selectedLocation } = useStore();
  const { sendChunkedBatchToShopify, isSending: isBatchSending, progress } = useBatchSendToShopify();
  const { settings: cutterSettings } = useCutterSettings();

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
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
        setPhase('auth', 'error', { message: 'Authentication check failed' });
      }
    };
    checkAdminRole();
  }, [setPhase]);

  const fetchItems = useCallback(async (page = 0, reset = false) => {
    // Check authentication first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication error in fetchItems:', authError);
      toast.error('Authentication required. Please sign in again.');
      setPhase('auth', 'error', { message: 'Authentication required. Please sign in again.' });
      setLoadingMore(false);
      return;
    }

    console.log('Fetching items for authenticated user:', user.email);
    
    // Prevent multiple simultaneous fetches
    if (snapshot.phases.data === 'loading' && reset) return;
    if (loadingMore && !reset) return;
    
    if (reset) {
      setPhase('data', 'loading', { message: 'Loading inventory...' });
      setCurrentPage(0);
      setHasMore(true);
      setItems([]);
    } else {
      setLoadingMore(true);
    }

    try {
      let query = supabase
        .from('intake_items')
        .select(`
          id,
          sku,
          brand_title,
          subject,
          card_number,
          variant,
          grade,
          price,
          quantity,
          type,
          created_at,
          printed_at,
          pushed_at,
          deleted_at,
          sold_at,
          shopify_sync_status,
          shopify_product_id,
          store_key,
          shopify_location_gid,
          psa_cert,
          catalog_snapshot,
          psa_snapshot,
          image_urls,
          year,
          category,
          cost,
          removed_from_batch_at,
          intake_lots!inner (
            lot_number,
            status
          )
        `)
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
      
      // Apply batch filter
      if (batchFilter === 'in_batch') {
        query = query.is('removed_from_batch_at', null);
      } else if (batchFilter === 'removed_from_batch') {
        query = query.not('removed_from_batch_at', 'is', null);
      }
      // 'all' applies no filter

      // Apply store/location filters
      if (assignedStore) {
        query = query.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      // Apply status filters
      if (statusFilter === 'active') {
        query = query.is('deleted_at', null).gt('quantity', 0);
      } else if (statusFilter === 'sold') {
        query = query.is('deleted_at', null).eq('quantity', 0).not('sold_at', 'is', null);
      } else if (statusFilter === 'deleted') {
        query = query.not('deleted_at', 'is', null);
      } else if (statusFilter === 'errors') {
        query = query.is('deleted_at', null).eq('shopify_sync_status', 'error');
      }
      
      if (statusFilter === 'all' && !showSoldItems) {
        query = query.gt('quantity', 0);
      }

      console.log('Executing inventory query with filters:', {
        assignedStore,
        selectedLocation,
        statusFilter,
        page,
        userId: user.id
      });

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Database query error:', error);
        
        // Check for common RLS/auth issues
        if (error.code === 'PGRST116' || error.message?.includes('JWT') || error.message?.includes('row-level security')) {
          console.error('RLS/Authentication issue detected');
          toast.error('Authentication session expired. Please refresh the page.');
        } else {
          toast.error(`Database error: ${error.message}`);
        }
        throw error;
      }

      console.log(`Successfully fetched ${data?.length || 0} items for page ${page}`);

      const newItems = data || [];
      setHasMore(newItems.length === ITEMS_PER_PAGE);
      
      if (reset) {
        setItems(newItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
      }
      setCurrentPage(page);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      
      // More specific error messages
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        if (dbError.code === 'PGRST116') {
          toast.error('Access denied. Please check your permissions.');
        } else if (dbError.message?.includes('JWT')) {
          toast.error('Session expired. Please refresh the page.');
        } else {
          toast.error(`Database error: ${dbError.message || 'Unknown error'}`);
        }
      } else {
        toast.error('Failed to load inventory items');
      }
      
      // Disable auto-refresh on repeated failures
      setAutoRefreshEnabled(false);
      setTimeout(() => setAutoRefreshEnabled(true), 60000); // Re-enable after 1 minute
    } finally {
      setPhase('data', 'success');
      setLastFetchTime(Date.now());
      setLoadingMore(false);
    }
  }, [statusFilter, typeFilter, batchFilter, assignedStore, selectedLocation, showSoldItems, snapshot.phases.data, loadingMore, setPhase]);

  // Memoized filtered items
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Apply search filter
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(item => (
        item.sku?.toLowerCase().includes(searchLower) ||
        item.brand_title?.toLowerCase().includes(searchLower) ||
        item.subject?.toLowerCase().includes(searchLower) ||
        item.card_number?.toLowerCase().includes(searchLower)
      ));
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        return itemType === typeFilter.toLowerCase();
      });
    }

    // Apply print status filter (only for Raw items)
    if (printStatusFilter !== 'all') {
      filtered = filtered.filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        if (itemType !== 'raw') return true; // Non-raw items are always included
        
        if (printStatusFilter === 'printed') {
          return item.printed_at !== null;
        } else if (printStatusFilter === 'not-printed') {
          return item.printed_at === null;
        }
        return true;
      });
    }

    return filtered;
  }, [items, debouncedSearchTerm, typeFilter, printStatusFilter]);

  // Reset pagination when filters change (only after store context is ready)
  useEffect(() => {
    // Add delay to ensure authentication is fully ready
    const timeoutId = setTimeout(() => {
      // Only fetch if store context is properly initialized
      if (assignedStore && selectedLocation) {
        console.log('Triggering fetchItems due to filter change:', {
          statusFilter,
          typeFilter,
          assignedStore,
          selectedLocation,
          showSoldItems
        });
        fetchItems(0, true);
      } else {
        console.log('Store context not ready for fetch:', { assignedStore, selectedLocation });
        setPhase('store', 'error', { message: 'Store context not ready' }); // Stop loading if store context isn't ready
      }
    }, 100); // Small delay to ensure auth state is ready

    return () => clearTimeout(timeoutId);
  }, [statusFilter, typeFilter, batchFilter, assignedStore, selectedLocation, showSoldItems]); // Removed fetchItems to prevent infinite loop
  
  // Persist batch filter preference
  useEffect(() => {
    localStorage.setItem('inventory-batch-filter', batchFilter);
  }, [batchFilter]);

  // Smart auto-refresh with circuit breaker - only refresh when sync status might have changed
  const { isPolling, error: pollingError, resetCircuitBreaker } = useStablePolling(
    () => fetchItems(0, true),
    {
      interval: 120000, // 2 minutes
      enabled: autoRefreshEnabled && !!assignedStore && !!selectedLocation,
      maxRetries: 3,
      backoffMultiplier: 2,
      maxInterval: 300000 // 5 minutes max
    }
  );

  // Show polling error if circuit breaker is triggered
  useEffect(() => {
    if (pollingError) {
      toast.error(`Auto-refresh paused due to errors. Click refresh controls to resume.`);
    }
  }, [pollingError]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchItems(currentPage + 1, false);
    }
  }, [fetchItems, currentPage, loadingMore, hasMore]);

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
      
      fetchItems(0, true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to queue sync");
    } finally {
      setSyncingRowId(null);
    }
  }, [assignedStore, selectedLocation, fetchItems]);

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
      fetchItems(0, true);
    } catch (error) {
      toast.error('Failed to retry sync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [fetchItems]);

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
      console.log(`[handleResync] Force updating item ${item.sku} to Shopify product ${item.shopify_product_id}`);
      
      // Queue item with update action - this will update existing product
      const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
        item_id: item.id,
        sync_action: 'update'
      });

      if (queueError) {
        throw new Error(`Failed to queue resync: ${queueError.message}`);
      }

      // Trigger the processor to immediately process the update
      await supabase.functions.invoke('shopify-sync', { body: {} });
      
      toast.success(
        `${item.sku} queued for resync`,
        {
          description: 'Product will be updated in Shopify',
          action: {
            label: "View Queue",
            onClick: () => window.location.href = '/admin#queue'
          }
        }
      );
      
      // Refresh items to show updated status
      fetchItems(0, true);
    } catch (error) {
      console.error('[handleResync] Failed:', error);
      toast.error('Failed to resync: ' + (error as Error).message);
    } finally {
      setSyncingRowId(null);
    }
  }, [fetchItems]);

  const handleSyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncingRef || bulkSyncing) {
      console.warn('[handleSyncSelected] Already syncing, ignoring duplicate call');
      return;
    }

    (bulkSyncingRef as any) = true;
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
          console.error(`Failed to queue ${item.sku}:`, error);
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

      fetchItems(0, true);
    } catch (error) {
      console.error('Bulk sync error:', error);
      toast.error('Failed to start bulk sync');
    } finally {
      (bulkSyncingRef as any) = false;
      setBulkSyncing(false);
    }
  }, [filteredItems, selectedItems, fetchItems]);

  const handleResyncSelected = useCallback(async () => {
    if (selectedItems.size === 0) {
      toast.info('No items selected');
      return;
    }

    if (bulkSyncingRef || bulkSyncing) {
      console.warn('[handleResyncSelected] Already syncing, ignoring duplicate call');
      return;
    }

    (bulkSyncingRef as any) = true;
    setBulkSyncing(true);

    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
    const itemsToResync = selectedItemsArray.filter(item => 
      item.shopify_product_id && item.store_key && item.shopify_location_gid
    );

    console.log('[handleResyncSelected] Starting resync', {
      selectedCount: selectedItems.size,
      itemsToResyncCount: itemsToResync.length,
      firstItem: itemsToResync[0]?.sku
    });

    if (itemsToResync.length === 0) {
      (bulkSyncingRef as any) = false;
      setBulkSyncing(false);
      toast.info('No synced items in selection to resync');
      return;
    }
    const toastId = toast.loading(`Queueing ${itemsToResync.length} items for resync...`);
    
    try {
      // Single batch RPC call instead of loop
      const { data, error } = await supabase.rpc('batch_queue_shopify_sync', {
        item_ids: itemsToResync.map(item => item.id),
        sync_action: 'update'
      });

      if (error) throw error;
      
      const result = data?.[0];
      const successCount = result?.queued_count || 0;
      const failCount = result?.failed_count || 0;

      toast.dismiss(toastId);
      
      if (successCount > 0) {
        // Trigger processor
        await supabase.functions.invoke('shopify-sync', { body: {} });
        toast.success(`${successCount} items queued for resync to Shopify`);
      }

      if (failCount > 0) {
        toast.error(`${failCount} items failed to queue`);
      }

      // Refresh in background (non-blocking)
      fetchItems(0, true);
    } catch (error) {
      console.error('Bulk resync error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        toast.error('Shopify sync service is unavailable', {
          description: 'Please contact support if this persists'
        });
      } else {
        toast.error('Failed to start bulk resync', {
          description: errorMessage
        });
      }
    } finally {
      (bulkSyncingRef as any) = false;
      setBulkSyncing(false);
    }
  }, [filteredItems, selectedItems, fetchItems]);

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
            console.error(`Failed to queue ${item.sku}:`, queueError);
            failCount++;
          } else {
            successCount++;
          }
          
          // Small delay between queue operations
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error queuing ${item.sku}:`, error);
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

      fetchItems(0, true);
    } catch (error) {
      console.error('Bulk retry error:', error);
      toast.error('Failed to start bulk retry');
    } finally {
      (bulkRetryingRef as any) = false;
      setBulkRetrying(false);
    }
  }, [filteredItems, selectedItems, fetchItems]);

  const handlePrint = useCallback(async (item: any) => {
    console.log('handlePrint called for item:', item.id);
    
    const itemType = item.type?.toLowerCase() || 'raw';
    
    // Only allow printing for Raw items
    if (itemType !== 'raw') {
      toast.error('Printing is only available for Raw cards');
      return;
    }
    
    if (!item.sku) {
      toast.error('No SKU available for printing');
      return;
    }

    try {
      setPrintingItem(item.id);
      
      // Helper function to truncate text for labels
      const truncateForLabel = (text: string, maxLength: number = 70): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };

      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts = []
        if (item.year) parts.push(item.year);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.subject) parts.push(item.subject);
        if (item.card_number) parts.push(`#${item.card_number}`);
        return parts.length > 0 ? parts.join(' ') : 'Raw Card';
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
          console.log('🖨️ Using ZPL Studio template:', tpl.name);
        }
      } catch (error) {
        console.warn('🖨️ Failed to load ZPL Studio template, falling back:', error);
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
      console.log('🖨️ Item data:', {
        id: item.id,
        subject: item.subject,
        brand_title: item.brand_title,
        card_number: item.card_number,
        condition: item.condition,
        price: item.price,
        sku: item.sku,
        year: item.year
      });

      // Debug: Log the template structure
      console.log('🖨️ Template loaded:', {
        id: tpl.id,
        name: tpl.name,
        format: tpl.format,
        hasLayout: !!tpl.layout,
        hasZpl: !!tpl.zpl,
        elements: tpl.layout?.elements?.map(el => ({ 
          id: el.id, 
          type: el.type, 
          content: el.type === 'text' ? (el as any).text : 
                   el.type === 'barcode' ? (el as any).data : 
                   'N/A'
        }))
      });

      // Prepare variables for template substitution
      const vars: JobVars = {
        CARDNAME: generateTitle(item),
        SETNAME: item.brand_title || '',
        CARDNUMBER: item.card_number || '',
        CONDITION: item.condition || 'NM',
        PRICE: item.price ? `$${item.price.toFixed(2)}` : '$0.00',
        SKU: item.sku || '',
        BARCODE: item.sku || item.id?.slice(-8) || 'NO-SKU',
      };

      console.log('🖨️ Template variables:', vars);

      let zpl = '';
      
      // Handle different template formats
      if (tpl.format === 'zpl_studio' && tpl.zpl) {
        console.log('🖨️ Processing ZPL Studio template...');
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
          
        console.log('🖨️ Generated ZPL from ZPL Studio template');
      } else if (tpl.format === 'elements' && tpl.layout) {
        console.log('🖨️ Processing elements template...');
        const filled = {
          ...tpl.layout,
          elements: tpl.layout.elements.map((el: ZPLElement) => {
            console.debug('[template_element]', { id: el.id, type: el.type });
            
            if (el.type === 'text') {
              let updatedElement = { ...el };
              let wasUpdated = false;
              
              // Map to correct element IDs from template
              if (el.id === 'cardinfo') {
                updatedElement.text = vars.CARDNAME ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated cardinfo: "${el.text}" → "${updatedElement.text}"`);
              } else if (el.id === 'condition') {
                updatedElement.text = vars.CONDITION ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated condition: "${el.text}" → "${updatedElement.text}"`);
              } else if (el.id === 'price') {
                updatedElement.text = vars.PRICE ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated price: "${el.text}" → "${updatedElement.text}"`);
              } else if (el.id === 'sku') {
                updatedElement.text = vars.SKU ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated sku: "${el.text}" → "${updatedElement.text}"`);
              } 
              // Legacy fallbacks for older templates
              else if (el.id === 'cardname') {
                updatedElement.text = vars.CARDNAME ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated cardname (legacy): "${el.text}" → "${updatedElement.text}"`);
              } else if (el.id === 'setname') {
                updatedElement.text = vars.SETNAME ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated setname: "${el.text}" → "${updatedElement.text}"`);
              } else if (el.id === 'cardnumber') {
                updatedElement.text = vars.CARDNUMBER ?? el.text;
                wasUpdated = true;
                console.log(`🖨️ Updated cardnumber: "${el.text}" → "${updatedElement.text}"`);
              }
              
              if (!wasUpdated) {
                console.log(`🖨️ No mapping for text element with id: "${el.id}", text: "${el.text}"`);
              }
              
              return updatedElement;
            } else if (el.type === 'barcode' && el.id === 'barcode') {
              const updatedElement = { ...el, data: vars.BARCODE ?? el.data };
              console.log(`🖨️ Updated barcode: "${el.data}" → "${updatedElement.data}"`);
              return updatedElement;
            }
            
            console.log(`🖨️ No mapping for element type: ${el.type}, id: ${el.id}`);
            return el;
          }),
        };
        zpl = zplFromElements(filled);
        console.log('🖨️ Generated ZPL from elements');
      } else if (tpl.format === 'zpl' && tpl.zpl) {
        console.log('🖨️ Processing ZPL string template...');
        zpl = zplFromTemplateString(tpl.zpl, vars);
        console.log('🖨️ Generated ZPL from string template');
      } else {
        console.error('🖨️ Invalid template format:', { format: tpl.format, hasLayout: !!tpl.layout, hasZpl: !!tpl.zpl });
        throw new Error('Invalid template format');
      }

      console.log('🖨️ Generated ZPL for printing (FULL):', zpl);
      console.log('🖨️ Generated ZPL contains vars:', {
        hasCardname: zpl.includes(vars.CARDNAME || ''),
        hasCondition: zpl.includes(vars.CONDITION || ''), 
        hasPrice: zpl.includes(vars.PRICE || ''),
        hasSku: zpl.includes(vars.SKU || ''),
        cardnameInZpl: vars.CARDNAME,
        conditionInZpl: vars.CONDITION,
        priceInZpl: vars.PRICE,
        skuInZpl: vars.SKU
      });

      // Use the new print queue system with ensurePQ1
      const { sanitizeLabel } = await import('@/lib/print/sanitizeZpl');
      const safeZpl = sanitizeLabel(zpl);
      
      console.debug("[print_prepare]", {
        template: 'inventory_item',
        qty: item.quantity || 1,
        preview: safeZpl.slice(0, 120).replace(/\n/g, "\\n")
      });
      
      await printQueue.enqueueSafe({ 
        zpl: safeZpl, 
        qty: item.quantity || 1, 
        usePQ: true 
      });

      console.log('🖨️ Label queued for printing');
      
      toast.success('Label queued for printing!');
      
      // Update the printed_at timestamp
      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', item.id);
        
      fetchItems(0, true);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print label: ' + (error as Error).message);
    } finally {
      setPrintingItem(null);
    }
  }, [fetchItems]);

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

      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts = []
        if (item.year) parts.push(item.year);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.subject) parts.push(item.subject);
        if (item.card_number) parts.push(`#${item.card_number}`);
        return parts.length > 0 ? truncateForLabel(parts.join(' ')) : 'Raw Card';
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
        console.log('🖨️ Processing ZPL Studio template for printer...');
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

      console.log('🖨️ handlePrintWithPrinter - Item details:', {
        itemId: item.id,
        quantity: item.quantity,
        sku: item.sku,
        type: itemType
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
      fetchItems(0, true);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print label');
    } finally {
      setPrintingItem(null);
      setPrintData(null);
    }
  }, [printData, selectedPrinter, fetchItems, fillElements]);

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
      
      console.log('🔪 Sending cut command to printer:', cutZpl);
      
      const result = await print(cutZpl, 1);
      
      if (result.success) {
        toast.success('Cut command sent successfully');
      } else {
        throw new Error(result.error || 'Cut command failed');
      }
      
    } catch (error) {
      console.error('Cut command error:', error);
      toast.error(`Failed to send cut command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const handleBulkPrintRaw = useCallback(async () => {
    // Guard against concurrent execution using ref for immediate check
    if (bulkPrintingRef || bulkPrinting) {
      console.warn('[handleBulkPrintRaw] Already printing, ignoring duplicate call');
      return;
    }
    
    // Set both ref and state
    (bulkPrintingRef as any) = true;
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
      
      // Filter for unprinted raw items - use current items state
      const unprintedRawItems = items.filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        return itemType === 'raw' && !item.printed_at && !item.deleted_at;
      });

      if (unprintedRawItems.length === 0) {
        toast.info('No unprinted raw cards found');
        return;
      }

      console.log(`[handleBulkPrintRaw] Processing ${unprintedRawItems.length} unprinted raw items`);

      // Helper function to truncate text for labels
      const truncateForLabel = (text: string, maxLength: number = 70): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };

      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts: string[] = [];
        if (item.subject) parts.push(item.subject);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.card_number) parts.push(`#${item.card_number}`);
        
        // Join and limit to reasonable length for label
        const title = parts.join(' • ');
        return title.length > 50 ? title.substring(0, 47) + '...' : title;
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
          console.log('[handleBulkPrintRaw] Using ZPL Studio template:', tpl.name);
        }
      } catch (error) {
        console.warn('[handleBulkPrintRaw] Failed to load ZPL Studio template, falling back:', error);
      }
      
      // Fallback to regular template system if no ZPL Studio template found
      if (!tpl || !tpl.zpl) {
        tpl = await getTemplate('raw_card_2x1');
      }
      
      if (!tpl) {
        toast.error('No label template available. Please contact administrator.');
        (bulkPrintingRef as any) = false;
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
            CONDITION: item?.variant ?? item?.condition ?? 'NM',
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
          fetchItems(0, true);
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
      console.error('Bulk print error:', error);
      toast.error(`Failed to queue bulk print: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      (bulkPrintingRef as any) = false;
      setBulkPrinting(false);
    }
  }, [items, fetchItems, cutterSettings, assignedStore, selectedLocation]);

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
    try {
      const selectedRawItems = items.filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        return selectedItems.has(item.id) && itemType === 'raw' && !item.deleted_at;
      });

      if (selectedRawItems.length === 0) {
        toast.info('No selected raw cards to reprint');
        return;
      }

      const tpl = await getTemplate('raw_card_2x1');
      if (!tpl || !tpl.zpl) {
        toast.error('Label template not found');
        return;
      }

      // Queue each label individually - print queue handles batching
      for (const item of selectedRawItems) {
        try {
          const vars: JobVars = {
            CARDNAME: item.subject || 'Raw Card',
            CONDITION: item?.condition ?? 'NM',
            PRICE: item?.price != null ? `$${Number(item.price).toFixed(2)}` : '$0.00',
            SKU: item?.sku ?? '',
            BARCODE: item?.sku ?? item?.id?.slice(-8) ?? 'NO-SKU',
          };

          const zpl = zplFromTemplateString(tpl.zpl, vars);
          await sendZplToPrinter(zpl, `Reprint: ${item.sku}`, { copies: 1 });
        } catch (err) {
          console.error(`Failed to queue ${item.sku}:`, err);
        }
      }

      toast.success(`${selectedRawItems.length} labels queued for printing`);
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Reprint error:', error);
      toast.error('Failed to queue reprint');
    } finally {
      setBulkPrinting(false);
    }
  }, [items, selectedItems, assignedStore, selectedLocation]);

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
      fetchItems(0, true);
      
    } catch (error: any) {
      console.error('Error removing from Shopify:', error);
      toast.error(`Failed to remove items: ${error.message}`);
    } finally {
      setRemovingFromShopify(false);
      setShowRemovalDialog(false);
      setSelectedItemForRemoval(null);
    }
  }, [selectedItemForRemoval, fetchItems]);

  // New comprehensive delete handler for admins
  const handleDeleteItems = useCallback(async (items: any[]) => {
    if (!isAdmin) {
      toast.error('Only admins can delete inventory items');
      return;
    }

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
      fetchItems(0, true);
      clearSelection();
      
    } catch (error: any) {
      console.error('Error deleting items:', error);
      toast.error(`Failed to delete items: ${error.message}`);
    } finally {
      setDeletingItems(false);
      setShowDeleteDialog(false);
      setSelectedItemsForDeletion([]);
    }
  }, [isAdmin, fetchItems, clearSelection]);

  // Debug logging with better context
  console.log('Inventory Debug:', {
    snapshot,
    itemsLength: items.length,
    filteredItemsLength: filteredItems.length,
    statusFilter,
    typeFilter,
    printStatusFilter,
    searchTerm,
    assignedStore,
    selectedLocation,
    storeContextReady: assignedStore && selectedLocation,
    filterDetails: {
      statusFilterApplied: statusFilter !== 'all',
      filteredByStatus: statusFilter === 'errors' ? items.filter(item => item.shopify_sync_status === 'error').length : 'N/A',
      allStatuses: items.map(item => item.shopify_sync_status).filter((v, i, a) => a.indexOf(v) === i)
    }
  });

  // Show loading states based on unified loading manager
  const needsLoadingState = snapshot.dominantPhase || 
    !assignedStore || !selectedLocation ||
    (filteredItems.length === 0 && (statusFilter !== 'all' || typeFilter !== 'all' || printStatusFilter !== 'all' || searchTerm.trim()));

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
              resetCircuitBreaker();
              fetchItems(0, true);
            }}
            onSignIn={() => window.location.href = '/auth'}
            onApproveRefresh={() => {
              incrementRefresh('inventory');
              setNextRefreshAt(null);
              fetchItems(0, true);
            }}
            onDismissRefresh={() => {
              incrementDismissedRefresh('inventory');
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
            <QueueStatusIndicator />
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
              <RefreshControls
                autoRefreshEnabled={autoRefreshEnabled}
                onAutoRefreshToggle={setAutoRefreshEnabled}
                onManualRefresh={() => fetchItems(0, true)}
                isRefreshing={snapshot.phases.data === 'loading'}
                lastRefresh={lastRefresh}
              />
              
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
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="errors">Errors</SelectItem>
                      <SelectItem value="deleted">Deleted</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="graded">Graded</SelectItem>
                      <SelectItem value="raw">Raw</SelectItem>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllVisible}
                      disabled={filteredItems.length === 0}
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All ({filteredItems.length})
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                      disabled={selectedItems.size === 0}
                    >
                      Clear Selection
                    </Button>

                    {selectedItems.size > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {selectedItems.size} selected
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <TestLabelButton />
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkPrintRaw}
                      disabled={bulkPrinting}
                    >
                      {bulkPrinting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4 mr-2" />
                      )}
                      {bulkPrinting ? 'Printing...' : 'Print All Unprinted Raw'}
                    </Button>

                    {selectedItems.size > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReprintSelected}
                        disabled={bulkPrinting}
                      >
                        {bulkPrinting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4 mr-2" />
                        )}
                        {bulkPrinting ? 'Reprinting...' : `Reprint Selected (${selectedItems.size})`}
                      </Button>
                    )}

                    {statusFilter === 'errors' && selectedItems.size > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkRetrySync}
                        disabled={bulkRetrying}
                      >
                        {bulkRetrying ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        {bulkRetrying ? 'Retrying...' : 'Retry Selected'}
                      </Button>
                    )}

                    {selectedItems.size > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSyncSelected}
                          disabled={bulkSyncing}
                        >
                          {bulkSyncing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          {bulkSyncing ? 'Syncing...' : 'Sync Selected'}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResyncSelected}
                          disabled={bulkSyncing}
                        >
                          {bulkSyncing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                          )}
                          {bulkSyncing ? 'Resyncing...' : 'Resync Selected'}
                        </Button>
                      </>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendCutCommand}
                      title="Send cut command to printer"
                    >
                      <Scissors className="h-4 w-4 mr-2" />
                      Cut
                    </Button>

                    {isAdmin && selectedItems.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
                          setSelectedItemsForDeletion(selectedItemsArray);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  Showing {filteredItems.length} of {items.length} items
                </div>
              </CardContent>
            </Card>

            {/* Items List */}
            <div className="space-y-4">
              {filteredItems.map((item) => (
                <InventoryItemCard
                  key={item.id}
                  item={item}
                  isSelected={selectedItems.has(item.id)}
                  isExpanded={expandedItems.has(item.id)}
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
                />
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}

              {filteredItems.length === 0 && snapshot.phases.data !== 'loading' && (
                <Card>
                  <CardContent className="text-center py-12">
                    <p className="text-muted-foreground">No items found matching your criteria.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <InventoryAnalytics />
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
            onRefresh={() => fetchItems(0, true)}
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
                <ItemTimeline key={itemId} item={item} />
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;