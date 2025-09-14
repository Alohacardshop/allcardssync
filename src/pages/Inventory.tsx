import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Search, CheckSquare, Square } from 'lucide-react';
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
  const [showSoldItems, setShowSoldItems] = useState(false);
  
  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [printingItem, setPrintingItem] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Dialog state
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [printData, setPrintData] = useState<{ blob: Blob; item: any } | null>(null);
  
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
    if (!debouncedSearchTerm && typeFilter === 'all') {
      return items;
    }

    return items.filter(item => {
      const searchLower = debouncedSearchTerm.toLowerCase();
      const matchesSearch = !debouncedSearchTerm || (
        item.sku?.toLowerCase().includes(searchLower) ||
        item.brand_title?.toLowerCase().includes(searchLower) ||
        item.subject?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.variant?.toLowerCase().includes(searchLower) ||
        item.grade?.toLowerCase().includes(searchLower)
      );

      // Type filter
      if (typeFilter !== 'all') {
        const itemType = item.type?.toLowerCase() || 'raw';
        if (typeFilter !== itemType) {
          return false;
        }
      }

      return matchesSearch;
    });
  }, [items, debouncedSearchTerm, typeFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    fetchItems(0, true);
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
      const isGraded = item.type === 'Graded' || item.psa_cert || item.grade;
      
      if (isGraded) {
        await sendGradedToShopify({
          storeKey: assignedStore as "hawaii" | "las_vegas",
          locationGid: selectedLocation,
          item: {
            id: item.id,
            sku: item.sku,
            psa_cert: item.psa_cert,
            barcode: item.barcode || item.sku,
            year: item.year,
            brand_title: item.brand_title,
            subject: item.subject,
            card_number: item.card_number,
            variant: item.variant,
            category_tag: item.game || 'Pokemon',
            image_url: item.catalog_snapshot?.image_url || item.psa_snapshot?.image_url || undefined,
            price: item.price ?? undefined,
            cost: item.cost ?? undefined,
            grade: item.grade,
            quantity: Number(item.quantity ?? 1)
          }
        });
      } else {
        await sendRawToShopify({
          storeKey: assignedStore as "hawaii" | "las_vegas",
          locationGid: selectedLocation,
          item: {
            id: item.id,
            sku: item.sku,
            brand_title: item.brand_title,
            subject: item.subject,
            card_number: item.card_number,
            image_url: item.catalog_snapshot?.image_url || item.image_urls?.[0] || undefined,
            price: item.price ?? undefined,
            cost: item.cost ?? undefined,
            barcode: item.barcode,
            condition: item.variant === 'Normal' ? 'Near Mint' : item.variant,
            quantity: Number(item.quantity ?? 1)
          }
        });
      }
      toast.success(`Synced ${item.sku} to Shopify`);
      fetchItems(0, true);
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
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
    if (!item.sku) {
      toast.error('No SKU available for printing');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create canvas context');

      const JsBarcode = (await import('jsbarcode')).default;
      JsBarcode(canvas, item.sku, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        lineColor: "#111827",
        margin: 8,
        width: 2,
        height: 100
      });

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });

      setPrintData({ blob, item });
      setShowPrinterDialog(true);
    } catch (error) {
      console.error('Error preparing print:', error);
      toast.error('Failed to prepare barcode for printing');
    }
  }, []);

  const handlePrintWithPrinter = useCallback(async (printerId: number) => {
    if (!printData) return;
    
    setPrintingItem(printData.item.id);
    try {
      if (!selectedPrinter) {
        toast.error('No printer selected');
        return;
      }
      const zpl = `^XA^LH0,0^LL203^PR6^MD8^FO50,30^A0N,25,25^FDLabel Print^FS^PQ1,0,1,Y^XZ`;
      await zebraNetworkService.printZPL(zpl, selectedPrinter, {
        title: `Barcode-${printData.item.sku}`,
        copies: 1 
      });

      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', printData.item.id);

      toast.success('Barcode printed successfully');
      fetchItems(0, true);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print barcode');
    } finally {
      setPrintingItem(null);
      setPrintData(null);
    }
  }, [printData, selectedPrinter, fetchItems]);

  const selectAllVisible = useCallback(() => {
    const allVisibleIds = new Set(filteredItems.map(item => item.id));
    setSelectedItems(allVisibleIds);
  }, [filteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedItems.size === filteredItems.length ? clearSelection() : selectAllVisible()}
                    >
                      {selectedItems.size === filteredItems.length ? (
                        <CheckSquare className="h-4 w-4 mr-2" />
                      ) : (
                        <Square className="h-4 w-4 mr-2" />
                      )}
                      {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    
                    {selectedItems.size > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {selectedItems.size} selected
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Showing {filteredItems.length} of {items.length} items
                  </div>
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
          onClose={() => setShowRemovalDialog(false)}
          items={Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : selectedItemForRemoval ? [selectedItemForRemoval] : []}
          loading={false}
          onConfirm={() => {
            setShowRemovalDialog(false);
            fetchItems(0, true);
          }}
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