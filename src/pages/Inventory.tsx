import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Search, CheckSquare, Square, Trash2, Printer } from 'lucide-react';
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
import { zebraNetworkService } from "@/lib/zebraNetworkService";
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { useBatchSendToShopify } from '@/hooks/useBatchSendToShopify';
import { useDebounce } from '@/hooks/useDebounce';
import { InventoryItemCard } from '@/components/InventoryItemCard';
import { InventorySkeleton } from '@/components/InventorySkeleton';
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { QueueStatusIndicator } from '@/components/QueueStatusIndicator';
import { InventoryDeleteDialog } from '@/components/InventoryDeleteDialog';

const ITEMS_PER_PAGE = 50;

const Inventory = () => {
  // Core state
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'sold' | 'deleted' | 'errors'>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [printStatusFilter, setPrintStatusFilter] = useState<'all' | 'printed' | 'not-printed'>('all');
  const [showSoldItems, setShowSoldItems] = useState(false);
  
  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [printingItem, setPrintingItem] = useState<string | null>(null);
  const [bulkPrinting, setBulkPrinting] = useState(false);
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
  
  const { printZPL, selectedPrinter } = useZebraNetwork();
  const { assignedStore, selectedLocation } = useStore();
  const { sendChunkedBatchToShopify, isSending: isBatchSending, progress } = useBatchSendToShopify();

  // Check admin role on mount
  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.rpc("has_role", { 
            _user_id: user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(data));
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      }
    };
    checkAdminRole();
  }, []);

  const fetchItems = useCallback(async (page = 0, reset = false) => {
    if (reset) {
      setLoading(true);
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
          intake_lots!inner (
            lot_number,
            status
          )
        `)
        .not('removed_from_batch_at', 'is', null)
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

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

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const newItems = data || [];
      setHasMore(newItems.length === ITEMS_PER_PAGE);
      
      if (reset) {
        setItems(newItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
      }
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, typeFilter, assignedStore, selectedLocation, showSoldItems]);

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

  // Reset pagination when filters change
  useEffect(() => {
    fetchItems(0, true);
  }, [fetchItems]);

  // Auto-refresh every 30 seconds to show latest sync status
  useEffect(() => {
    const interval = setInterval(() => {
      fetchItems(0, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchItems]);

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
      await supabase.functions.invoke('shopify-sync-processor', { body: {} });
      
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
      
      const result = await sendChunkedBatchToShopify(
        [item.id],
        item.store_key as "hawaii" | "las_vegas",
        item.shopify_location_gid
      );
      
      toast.success(`Sync retry initiated for ${item.store_key} store`);
      fetchItems(0, true);
    } catch (error) {
      toast.error('Failed to retry sync: ' + (error as Error).message);
    }
  }, [sendChunkedBatchToShopify, fetchItems]);

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
      
      // Load cutter settings
      let cutterConfig = {
        cutAfter: true,
        cutTiming: 'after-each' as const,
        cutInterval: 1,
        hasCutter: true
      };
      
      try {
        const savedCutterConfig = localStorage.getItem('zebra-cutter-config');
        if (savedCutterConfig) {
          const parsedConfig = JSON.parse(savedCutterConfig);
          cutterConfig = {
            ...cutterConfig,
            ...parsedConfig,
            // Ensure cutTiming exists for backward compatibility
            cutTiming: parsedConfig.cutTiming || 'after-each'
          };
        }
      } catch (error) {
        console.warn('Failed to load cutter config:', error);
      }
      
      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts = []
        if (item.year) parts.push(item.year);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.subject) parts.push(item.subject);
        if (item.card_number) parts.push(`#${item.card_number}`);
        return parts.length > 0 ? parts.join(' ') : 'Raw Card';
      };

      // Use enhanced ZPL template for raw cards with cutter settings
      const { generateRawCardLabelZPL } = await import('@/lib/simpleZPLTemplates');
      const zpl = generateRawCardLabelZPL({
        title: generateTitle(item),
        sku: item.sku || '',
        price: item.price ? parseFloat(item.price).toFixed(2) : '0.00',
        condition: item.condition || 'NM',
        location: item.location || ''
      }, {
        dpi: 203,
        speed: 4,
        darkness: 10,
        copies: 1,
        cutAfter: cutterConfig.cutAfter,
        cutTiming: cutterConfig.cutTiming,
        cutInterval: cutterConfig.cutInterval,
        hasCutter: cutterConfig.hasCutter
      });

      console.log('Generated ZPL for printing:', zpl);
      console.log('ZPL byte length:', zpl.length);
      console.log('ZPL first 200 chars:', zpl.substring(0, 200));
      console.log('ZPL last 50 chars:', zpl.substring(zpl.length - 50));

      // Try PrintNode first (preferred method)
      try {
        // Get saved PrintNode printer ID from localStorage (matches PrintNodeContext storage)
        const savedConfig = localStorage.getItem('zebra-printer-config');
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          if (config.usePrintNode && config.printNodeId) {
            const printNodeService = await import('@/lib/printNodeService');
            
            const result = await printNodeService.printNodeService.printZPL(zpl, config.printNodeId, 1);
            
            if (result.success) {
              toast.success('Raw card label sent to PrintNode successfully');
            } else {
              throw new Error(result.error || 'PrintNode print failed');
            }
          } else {
            throw new Error('No PrintNode printer configured');
          }
        } else {
          throw new Error('No PrintNode printer configured');
        }
      } catch (printNodeError) {
        console.log('PrintNode failed, trying direct Zebra printing:', printNodeError);
        
        // Fallback to direct Zebra printing if available
        if (!selectedPrinter) {
          throw new Error('No PrintNode configuration and no Zebra printer selected. Please configure printing in Test Hardware > Printer Setup.');
        }

        await zebraNetworkService.printZPL(zpl, selectedPrinter, {
          title: `Raw-Card-${item.sku}`,
          copies: 1 
        });

        toast.success('Raw card label printed via direct connection');
      }

      // Mark as printed in database
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
  }, [selectedPrinter, fetchItems]);

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

      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts = []
        if (item.year) parts.push(item.year);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.subject) parts.push(item.subject);
        if (item.card_number) parts.push(`#${item.card_number}`);
        return parts.length > 0 ? parts.join(' ') : 'Raw Card';
      };

      // Use enhanced ZPL template for raw cards
      const { generateRawCardLabelZPL } = await import('@/lib/simpleZPLTemplates');
      const zpl = generateRawCardLabelZPL({
        title: generateTitle(item),
        sku: item.sku || '',
        price: item.price ? parseFloat(item.price).toFixed(2) : '0.00',
        condition: item.condition || 'NM',
        location: item.location || ''
      }, {
        dpi: 203,
        speed: 4,
        darkness: 10,
        copies: 1
      });

      await zebraNetworkService.printZPL(zpl, selectedPrinter, {
        title: `Raw-Card-${item.sku}`,
        copies: 1 
      });

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
  }, [printData, selectedPrinter, fetchItems]);

  const handleBulkPrintRaw = useCallback(async () => {
    setBulkPrinting(true);
    
    try {
      // Filter for unprinted raw items
      const unprintedRawItems = items.filter(item => {
        const itemType = item.type?.toLowerCase() || 'raw';
        return itemType === 'raw' && !item.printed_at && !item.deleted_at;
      });

      if (unprintedRawItems.length === 0) {
        toast.info('No unprinted raw cards found');
        return;
      }

      // Check for PrintNode configuration first
      const savedPrinter = localStorage.getItem('printnode-selected-printer');
      const usePrintNode = !!savedPrinter;
      
      if (!usePrintNode && !selectedPrinter) {
        toast.error('Please configure PrintNode or select a Zebra printer in Test Hardware > Printer Setup');
        return;
      }

      const { generateRawCardLabelZPL } = await import('@/lib/simpleZPLTemplates');
      let successCount = 0;
      let errorCount = 0;

      // Generate proper title for raw card
      const generateTitle = (item: any) => {
        const parts = []
        if (item.year) parts.push(item.year);
        if (item.brand_title) parts.push(item.brand_title);
        if (item.subject) parts.push(item.subject);
        if (item.card_number) parts.push(`#${item.card_number}`);
        return parts.length > 0 ? parts.join(' ') : 'Raw Card';
      };

      for (const item of unprintedRawItems) {
        try {
          const zpl = generateRawCardLabelZPL({
            title: generateTitle(item),
            sku: item.sku || '',
            price: item.price ? parseFloat(item.price).toFixed(2) : '0.00',
            condition: item.condition || 'NM',
            location: item.location || ''
          }, {
            dpi: 203,
            speed: 4,
            darkness: 10,
            copies: 1
          });

          // Try PrintNode first if configured
          if (usePrintNode) {
            const printerConfig = JSON.parse(savedPrinter!);
            const printNodeService = await import('@/lib/printNodeService');
            
            const result = await printNodeService.printNodeService.printZPL(zpl, printerConfig.id, 1);
            
            if (!result.success) {
              throw new Error(result.error || 'PrintNode print failed');
            }
          } else {
            // Fallback to direct Zebra printing
            await zebraNetworkService.printZPL(zpl, selectedPrinter!, {
              title: `Bulk-Raw-${item.sku}`,
              copies: 1 
            });
          }

          // Mark as printed
          await supabase
            .from('intake_items')
            .update({ printed_at: new Date().toISOString() })
            .eq('id', item.id);

          successCount++;
        } catch (error) {
          console.error(`Failed to print ${item.sku}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully printed ${successCount} raw card labels`);
        fetchItems(0, true); // Refresh the items list
      }
      
      if (errorCount > 0) {
        toast.error(`Failed to print ${errorCount} labels`);
      }

    } catch (error) {
      console.error('Bulk print error:', error);
      toast.error('Failed to start bulk printing');
    } finally {
      setBulkPrinting(false);
    }
  }, [items, selectedPrinter, fetchItems]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto p-6">
          <InventorySkeleton />
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
          <QueueStatusIndicator />
        </div>

        <Tabs defaultValue="inventory" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="inventory">Inventory Management</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-6">
            {/* Filters and Search */}
            <Card>
              <CardHeader>
                <CardTitle>Filters & Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

              {filteredItems.length === 0 && !loading && (
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