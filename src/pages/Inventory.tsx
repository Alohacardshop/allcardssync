import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Package, Calendar, DollarSign, Eye, EyeOff, FileText, Tag, Printer, ExternalLink, RotateCcw, Loader2, Upload, Home, X, CheckSquare, Square, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShopifyRemovalDialog } from '@/components/ShopifyRemovalDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StoreLocationSelector } from '@/components/StoreLocationSelector';
import { MultiStoreLocationSelector } from '@/components/MultiStoreLocationSelector';
import { useStore } from '@/contexts/StoreContext';
import { Navigation } from '@/components/Navigation';
import BarcodeLabel from '@/components/BarcodeLabel';
import { usePrintNode } from '@/hooks/usePrintNode';
import { Link } from 'react-router-dom';
import { sendGradedToShopify, sendRawToShopify } from '@/hooks/useShopifySend';
import { FLAGS } from '@/lib/flags';

const Inventory = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'sold' | 'deleted' | 'errors'>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedStoreKey, setSelectedStoreKey] = useState<string>('');
  const [selectedLocationGid, setSelectedLocationGid] = useState<string>('');
  const [selectedStoreLocations, setSelectedStoreLocations] = useState<Array<{
    storeKey: string;
    storeName: string;
    locationGid: string;
    locationName: string;
  }>>([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [printingItem, setPrintingItem] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showSoldItems, setShowSoldItems] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [syncDetailsRow, setSyncDetailsRow] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [forceDeleting, setForceDeleting] = useState(false);
  
  const { printPNG, selectedPrinter } = usePrintNode();
  const { selectedStore, selectedLocation } = useStore();

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

  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('intake_items')
        .select(`
          *,
          intake_lots (
            lot_number,
            status
          )
        `)
        .not('removed_from_batch_at', 'is', null);

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
      
      // Show sold items toggle (only affects 'all' status)
      if (statusFilter === 'all' && !showSoldItems) {
        query = query.gt('quantity', 0);
      }

      // Apply store/location filters
      if (selectedStoreLocations.length > 0) {
        // Filter by selected store/location combinations
        const conditions = selectedStoreLocations.map(sl => 
          `(store_key.eq.${sl.storeKey},shopify_location_gid.eq.${sl.locationGid})`
        ).join(',');
        query = query.or(conditions);
      } else {
        // Fallback to single store/location selection for backward compatibility
        if (selectedStoreKey) {
          query = query.eq('store_key', selectedStoreKey);
        }
        if (selectedLocationGid) {
          query = query.eq('shopify_location_gid', selectedLocationGid);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [statusFilter, typeFilter, selectedStoreKey, selectedLocationGid, selectedStoreLocations, showSoldItems]);

  // Update legacy state when context changes (for backward compatibility)
  useEffect(() => {
    setSelectedStoreKey(selectedStore || '');
    setSelectedLocationGid(selectedLocation || '');
  }, [selectedStore, selectedLocation]);

  // F) Manual sync retry function - now uses v2 batch router
  const retrySync = async (item: any) => {
    try {
      const { error } = await supabase.functions.invoke('v2-batch-send-to-inventory', {
        body: {
          storeKey: item.store_key,
          locationGid: item.shopify_location_gid,
          itemIds: [item.id]
        }
      });

      if (error) throw error;
      toast.success('Sync retry initiated');
      fetchItems(); // Refresh to see updated status
    } catch (error) {
      console.error('Retry sync failed:', error);
      toast.error('Failed to retry sync');
    }
  };

  const filteredItems = items.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
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

  const syncAllVisible = async () => {
    setSyncingAll(true);
    try {
      // Group items by store + SKU to deduplicate
      const itemGroups = new Map();
      
      filteredItems.forEach(item => {
        if (!item.sku || !item.store_key) return;
        
        const key = `${item.store_key}-${item.sku}`;
        if (!itemGroups.has(key)) {
          itemGroups.set(key, {
            storeKey: item.store_key,
            sku: item.sku,
            locationGid: item.shopify_location_gid,
          });
        }
      });

      const uniqueItems = Array.from(itemGroups.values());
      let successCount = 0;
      let errorCount = 0;

      // Process in batches with concurrency limit
      const batchSize = 5;
      for (let i = 0; i < uniqueItems.length; i += batchSize) {
        const batch = uniqueItems.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (item) => {
            try {
              // Use v2 batch router for bulk sync
              const { error } = await supabase.functions.invoke('v2-batch-send-to-inventory', {
                body: {
                  storeKey: item.storeKey,
                  locationGid: item.locationGid,
                  itemIds: [] // This would need actual item IDs from the filtered items
                }
              });
              
              if (error) throw error;
              successCount++;
            } catch (error) {
              console.error(`Sync failed for ${item.sku}:`, error);
              errorCount++;
            }
          })
        );
        
        // Small delay between batches
        if (i + batchSize < uniqueItems.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      toast.success(`Sync completed: ${successCount} successful, ${errorCount} errors`);
      fetchItems(); // Refresh to see updated statuses
    } catch (error) {
      console.error('Sync all failed:', error);
      toast.error('Failed to sync items');
    } finally {
      setSyncingAll(false);
    }
  };

  const handlePrint = async (item: any) => {
    if (!item.sku) {
      toast.error('No SKU available for printing');
      return;
    }

    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setPrintingItem(item.id);
    try {
      // Generate barcode as PNG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create canvas context');

      // Import and generate barcode
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

      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });

      // Print using PrintNode
      await printPNG(blob, { 
        title: `Barcode-${item.sku}`,
        copies: 1 
      });

      // Update printed_at timestamp
      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', item.id);

      toast.success('Barcode printed successfully');
      fetchItems(); // Refresh to show updated printed_at
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setPrintingItem(null);
    }
  };

  const onSync = async (row: any) => {
    if (!selectedLocationGid) { 
      toast.error("Pick a location first"); 
      return;
    }
    
    setSyncingRowId(row.id);
    try {
      // Route to correct v2 sender based on item type
      const isGraded = row.type === 'Graded' || row.psa_cert || row.grade;
      
      if (isGraded) {
        await sendGradedToShopify({
          storeKey: selectedStoreKey as "hawaii" | "las_vegas",
          locationGid: selectedLocationGid,
          item: {
            id: row.id,
            sku: row.sku,
            psa_cert: row.psa_cert,
            barcode: row.barcode || row.sku,
            // Rich metadata for proper Shopify title/description
            year: row.year,
            brand_title: row.brand_title,
            subject: row.subject,
            card_number: row.card_number,
            variant: row.variant,
            category_tag: row.game || 'Pokemon',
            image_url: row.catalog_snapshot?.imageUrl || row.psa_snapshot?.imageUrl || undefined,
            price: row.price ?? undefined,
            cost: row.cost ?? undefined,
            grade: row.grade,
            quantity: Number(row.quantity ?? 1)
          }
        });
      } else {
        await sendRawToShopify({
          storeKey: selectedStoreKey as "hawaii" | "las_vegas",
          locationGid: selectedLocationGid,
          item: {
            id: row.id,
            sku: row.sku,
            title: row.brand_title || row.subject,
            price: row.price ?? undefined,
            barcode: row.barcode,
            condition: row.variant,
            quantity: Number(row.quantity ?? 1)
          }
        });
      }
      toast.success(`Synced ${row.sku} to Shopify`);
      fetchItems();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncingRowId(null);
    }
  };

  // Legacy function for existing retry button
  const syncToShopify = async (item: any) => {
    await onSync(item);
  };

  const handleRemoveFromShopify = (item: any) => {
    setSelectedItemForRemoval(item);
    setShowRemovalDialog(true);
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAllVisible = () => {
    const allVisibleIds = new Set(filteredItems.map(item => item.id));
    setSelectedItems(allVisibleIds);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleBulkRemoval = () => {
    const selectedItemsArray = filteredItems.filter(item => selectedItems.has(item.id));
    setSelectedItemForRemoval(selectedItemsArray);
    setShowRemovalDialog(true);
  };

  const handleDeleteAllVisibleGraded = () => {
    const gradedItems = filteredItems.filter(item => 
      item.type === 'Graded' && (item.shopify_product_id || item.sku)
    );
    if (gradedItems.length === 0) {
      toast.error('No graded items found to delete');
      return;
    }
    setSelectedItemForRemoval(gradedItems);
    setShowRemovalDialog(true);
  };

  const onRemovalConfirm = async (mode: 'delete') => {
    setBulkDeleting(true);
    try {
      const itemsToProcess = Array.isArray(selectedItemForRemoval) 
        ? selectedItemForRemoval 
        : [selectedItemForRemoval];

      // First, archive items locally
      const itemIds = itemsToProcess.map(item => item.id);
      
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Removed via Inventory UI'
        })
        .in('id', itemIds);

      if (error) throw error;

      // Now handle Shopify removal for each item
      const removalPromises = itemsToProcess.map(async (item) => {
        try {
          // Skip if no Shopify data
          if (!item.sku && !item.shopify_product_id) {
            console.log(`⏭️ Skipping Shopify removal for item ${item.id} - no SKU or product ID`);
            return;
          }

          // Determine item type and call appropriate function
          const isGraded = item.type === 'Graded' || 
                          (item.psa_cert && item.psa_cert.trim() !== '') || 
                          (item.grade && item.grade.trim() !== '' && item.grade !== '0');

          if (isGraded) {
            console.log(`🏆 Removing graded item ${item.id} from Shopify`);
            await supabase.functions.invoke('v2-shopify-remove-graded', {
              body: {
                storeKey: item.store_key,
                productId: item.shopify_product_id,
                sku: item.sku,
                locationGid: item.shopify_location_gid,
                itemId: item.id
              }
            });
          } else {
            console.log(`📦 Reducing raw item ${item.id} quantity in Shopify`);
            await supabase.functions.invoke('v2-shopify-remove-raw', {
              body: {
                storeKey: item.store_key,
                productId: item.shopify_product_id,
                sku: item.sku,
                locationGid: item.shopify_location_gid,
                itemId: item.id,
                quantity: item.quantity || 1
              }
            });
          }
        } catch (shopifyError) {
          console.error(`Failed to remove item ${item.id} from Shopify:`, shopifyError);
          // Don't throw here - we want to continue with other items
        }
      });

      // Wait for all Shopify removals to complete (or fail)
      await Promise.allSettled(removalPromises);

      toast.success(
        `Archived ${itemIds.length} item${itemIds.length !== 1 ? 's' : ''} and removed from Shopify.`,
        {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                const { error: restoreError } = await supabase
                  .from('intake_items')
                  .update({ 
                    deleted_at: null,
                    deleted_reason: null 
                  })
                  .in('id', itemIds);
                
                if (restoreError) throw restoreError;
                toast.success("Items restored");
                fetchItems();
              } catch (err) {
                console.error('Restore failed:', err);
                toast.error('Failed to restore items');
              }
            }
          }
        }
      );
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      fetchItems();
    } catch (error) {
      console.error('Bulk removal failed:', error);
      toast.error('Failed to archive items');
    } finally {
      setBulkDeleting(false);
      setShowRemovalDialog(false);
      setSelectedItemForRemoval(null);
    }
  };

  const handleInspectInShopify = (item: any) => {
    // Feature disabled for v2 rebuild
    toast.error("Inspect functionality is being rebuilt. Coming soon!");
  };





  const handleDeleteDuplicates = async (sku: string) => {
    try {
      const item = items.find(i => i.sku === sku);
      if (!item) {
        toast.error('Could not find item for SKU');
        return;
      }

      const { data, error } = await supabase.functions.invoke('shopify-delete-duplicates', {
        body: { storeKey: item.store_key, sku }
      });

      if (error) throw error;

      const deletedCount = data?.deletedVariantIds?.length || 0;
      toast.success(`Deleted ${deletedCount} duplicate variant${deletedCount !== 1 ? 's' : ''}`);
      
    } catch (error) {
      console.error('Delete duplicates failed:', error);
      toast.error('Failed to delete duplicates');
    }
  };

  // Admin-only force delete that bypasses Shopify
  const handleForceDelete = async (itemsToDelete: any[]) => {
    if (!isAdmin) {
      toast.error('Admin access required for force delete');
      return;
    }

    setForceDeleting(true);
    try {
      const itemIds = itemsToDelete.map(item => item.id);
      
      // Direct database deletion without Shopify interaction
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Force deleted by admin - bypassed Shopify removal',
          shopify_sync_status: 'force_deleted'
        })
        .in('id', itemIds);

      if (error) throw error;

      toast.success(
        `Force deleted ${itemIds.length} item${itemIds.length !== 1 ? 's' : ''} from inventory (bypassed Shopify)`
      );
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      fetchItems();
    } catch (error) {
      console.error('Force delete failed:', error);
      toast.error('Failed to force delete items');
    } finally {
      setForceDeleting(false);
    }
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  if (loading) {
    return (
      <>
        <div className="container mx-auto p-4">
          <div className="text-center py-8">Loading inventory...</div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Navigation Header */}
      <div className="bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-lg font-semibold">Inventory</h1>
            </div>
            <Navigation showMobileMenu={true} />
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Inventory ({filteredItems.length} items)
                {selectedItems.size > 0 && (
                  <Badge variant="secondary">
                    {selectedItems.size} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {filteredItems.filter(item => item.type === 'Graded' && (item.shopify_product_id || item.sku)).length > 0 && (
                  <Button
                    onClick={handleDeleteAllVisibleGraded}
                    variant="destructive"
                    size="sm"
                    disabled={bulkDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All from Shopify ({filteredItems.filter(item => item.type === 'Graded' && (item.shopify_product_id || item.sku)).length})
                  </Button>
                )}
                <Button
                  onClick={syncAllVisible}
                  disabled={syncingAll || filteredItems.length === 0}
                >
                  {syncingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Sync All ({filteredItems.length})
                    </>
                  )}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Store & Location Filter */}
              <div className="space-y-4">
                <MultiStoreLocationSelector 
                  className="max-w-lg"
                  selectedItems={selectedStoreLocations}
                  onChange={setSelectedStoreLocations}
                />
                
                {/* Legacy single selection - only show if no multi-selections are made */}
                {selectedStoreLocations.length === 0 && (
                  <div className="text-sm text-muted-foreground border-t pt-4">
                    <p className="mb-2">Or use single store/location selection:</p>
                    <StoreLocationSelector className="max-w-md" showSetDefault={false} />
                  </div>
                )}
              </div>
              
              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="type-filter" className="text-sm font-medium">Type:</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="raw">Raw</SelectItem>
                      <SelectItem value="graded">Graded</SelectItem>
                      <SelectItem value="bulk">Bulk</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex-1">
                  <Input
                    placeholder="Search by SKU, brand, subject, category, variant, or grade..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-md"
                  />
                </div>
              </div>

              {/* Status Tabs */}
              <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <TabsList>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="sold">Sold</TabsTrigger>
                  <TabsTrigger value="errors">Errors</TabsTrigger>
                  <TabsTrigger value="deleted">Deleted</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
                
                <TabsContent value={statusFilter} className="mt-4">
                  {/* Bulk Selection Toolbar */}
                  {selectedItems.size > 0 && (
                    <Card className="bg-muted/50 border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-medium">
                              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                            </span>
                            <Button
                              onClick={clearSelection}
                              variant="ghost"
                              size="sm"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Clear Selection
                            </Button>
                          </div>
                           <div className="flex items-center gap-2">
                             <Button
                               onClick={handleBulkRemoval}
                               variant="destructive"
                               size="sm"
                               disabled={bulkDeleting}
                             >
                               {bulkDeleting ? (
                                 <>
                                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                   Processing...
                                 </>
                               ) : (
                                 <>
                                   <Trash2 className="w-4 h-4 mr-2" />
                                   Delete from Shopify
                                 </>
                               )}
                             </Button>
                             {isAdmin && (
                               <Button
                                 onClick={() => handleForceDelete(filteredItems.filter(item => selectedItems.has(item.id)))}
                                 variant="destructive"
                                 size="sm"
                                 disabled={forceDeleting}
                                 className="bg-red-600 hover:bg-red-700"
                               >
                                 {forceDeleting ? (
                                   <>
                                     <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                     Force Deleting...
                                   </>
                                 ) : (
                                   <>
                                     <X className="w-4 h-4 mr-2" />
                                     Force Delete (Admin)
                                   </>
                                 )}
                               </Button>
                             )}
                           </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Select All Controls */}
                  {filteredItems.length > 0 && (
                    <div className="flex items-center gap-2 py-2">
                      <Button
                        onClick={selectAllVisible}
                        variant="ghost"
                        size="sm"
                        disabled={selectedItems.size === filteredItems.length}
                      >
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Select All ({filteredItems.length})
                      </Button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {filteredItems.map((item) => (
                      <Card key={item.id} className={cn(
                        "transition-all duration-200",
                        item.deleted_at && "bg-muted/50 border-destructive/20"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Selection Checkbox */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 mt-1"
                                onClick={() => toggleItemSelection(item.id)}
                              >
                                {selectedItems.has(item.id) ? (
                                  <CheckSquare className="h-4 w-4 text-primary" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </Button>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {item.sku || 'No SKU'}
                                  </Badge>
                                  {item.grade && (
                                    <Badge variant="secondary">
                                      {item.grading_company || 'PSA'} {item.grade}
                                    </Badge>
                                  )}
                                  <Badge variant="outline">
                                    Qty: {item.quantity || 0}
                                  </Badge>
                                  {item.deleted_at && (
                                    <Badge variant="destructive">Deleted</Badge>
                                  )}
                                  {/* C) Show sold badge when sold */}
                                  {item.sold_at && (
                                    <Badge variant="secondary">Sold</Badge>
                                  )}
                                </div>

                                <h3 className="font-medium text-lg mb-1">
                                  {(() => {
                                    const parts = [];
                                    
                                    // Add year
                                    if (item.year) parts.push(item.year);
                                    
                                    // Add brand/set name
                                    if (item.brand_title) parts.push(item.brand_title);
                                    
                                    // Add card number with # prefix
                                    if (item.card_number) parts.push(`#${item.card_number}`);
                                    
                                    // Add subject (card name)
                                    if (item.subject) parts.push(item.subject);
                                    
                                    // Add variant with dash prefix for graded items, or just variant for raw
                                    if (item.variant && item.variant !== 'Raw') {
                                      if (item.type === 'Graded' || item.grade || item.psa_cert) {
                                        parts.push(`-${item.variant}`);
                                      } else {
                                        parts.push(item.variant);
                                      }
                                    }
                                    
                                    // Add grade info for graded items
                                    if (item.grade && item.psa_cert) {
                                      parts.push(`PSA ${item.grade}`);
                                    } else if (item.grade) {
                                      parts.push(`Grade ${item.grade}`);
                                    } else if (item.psa_cert) {
                                      parts.push(`PSA ${item.psa_cert}`);
                                    }
                                    
                                    return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item');
                                  })()}
                                </h3>

                                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="w-4 h-4" />
                                    ${item.price || '0'}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(item.created_at).toLocaleDateString()}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Tag className="w-4 h-4" />
                                    {item.category || 'Uncategorized'}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 mb-2">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                         <Badge 
                                           variant={
                                             (item.shopify_sync_status === 'synced' || item.shopify_sync_status === 'success') ? 'default' : 
                                             item.shopify_sync_status === 'error' ? 'destructive' : 
                                             'secondary'
                                           }
                                         >
                                           {(item.shopify_sync_status === 'success') ? 'synced' : (item.shopify_sync_status || 'pending')}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {item.shopify_sync_status === 'error' && item.last_shopify_sync_error ? (
                                          <div className="max-w-xs">
                                            <p className="font-medium">Sync Error:</p>
                                            <p className="text-sm">{item.last_shopify_sync_error}</p>
                                          </div>
                                        ) : item.shopify_sync_status === 'pending' ? (
                                          'Auto sync runs when moved to inventory. In manual mode, press Sync.'
                                        ) : item.shopify_sync_status === 'synced' && item.last_shopify_synced_at ? (
                                          `Synced ${formatDistanceToNow(new Date(item.last_shopify_synced_at), { addSuffix: true })}`
                                        ) : (
                                          'Sync status'
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  
                                  {/* F) Retry button for error status */}
                                  {item.shopify_sync_status === 'error' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => retrySync(item)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                  
                                  {item.shopify_sync_status === 'synced' && item.last_shopify_synced_at && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(item.last_shopify_synced_at), { addSuffix: true })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <div className="flex gap-2">
                                {/* B) Hide Print button for graded items */}
                                {item.type !== 'Graded' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePrint(item)}
                                    disabled={!item.sku || printingItem === item.id || !selectedPrinter}
                                  >
                                    {printingItem === item.id ? (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <Printer className="w-4 h-4 mr-1" />
                                    )}
                                    {printingItem === item.id ? 'Printing...' : 'Print'}
                                  </Button>
                                )}
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={() => onSync(item)}
                                   disabled={!item.sku || !item.store_key || !selectedLocationGid || syncingRowId === item.id}
                                 >
                                   {syncingRowId === item.id ? (
                                     <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                   ) : (
                                     <ExternalLink className="w-4 h-4 mr-1" />
                                   )}
                                   {syncingRowId === item.id ? 'Syncing...' : 'Sync'}
                                 </Button>
                                 
                                 {/* View Sync Details button */}
                                 {item.shopify_sync_snapshot && (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => setSyncDetailsRow(item)}
                                   >
                                     <FileText className="w-4 h-4 mr-1" />
                                     View Sync Details
                                   </Button>
                                 )}
                                 {!item.deleted_at && (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => handleRemoveFromShopify(item)}
                                     disabled={!item.sku && !item.shopify_product_id}
                                   >
                                     <Trash2 className="w-4 h-4 mr-1" />
                                     Remove
                                   </Button>
                                 )}
                                 
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleInspectInShopify(item)}
                                    disabled={!item.sku}
                                  >
                                    <Search className="w-4 h-4 mr-1" />
                                    Inspect
                                  </Button>

                                 {/* Admin Force Delete Button */}
                                 {isAdmin && !item.deleted_at && (
                                   <TooltipProvider>
                                     <Tooltip>
                                       <TooltipTrigger asChild>
                                         <Button
                                           variant="destructive"
                                           size="sm"
                                           onClick={() => handleForceDelete([item])}
                                           disabled={forceDeleting}
                                           className="bg-red-600 hover:bg-red-700"
                                         >
                                           {forceDeleting ? (
                                             <Loader2 className="w-4 h-4" />
                                           ) : (
                                             <X className="w-4 h-4" />
                                           )}
                                         </Button>
                                       </TooltipTrigger>
                                       <TooltipContent>
                                         <p>Force Delete (Admin) - Bypasses Shopify</p>
                                       </TooltipContent>
                                     </Tooltip>
                                   </TooltipProvider>
                                 )}

                                 {/* Quick Delete as Graded for individual items */}
                                 {item.type === 'Graded' && (item.shopify_product_id || item.sku) && (
                                   <TooltipProvider>
                                     <Tooltip>
                                       <TooltipTrigger asChild>
                                         <Button
                                           variant="destructive"
                                           size="sm"
                                           onClick={() => {
                                             setSelectedItemForRemoval([item]);
                                             setShowRemovalDialog(true);
                                           }}
                                           className="h-8"
                                           disabled={bulkDeleting}
                                         >
                                           <Trash2 className="w-3 h-3" />
                                         </Button>
                                       </TooltipTrigger>
                                       <TooltipContent>
                                         <p>Delete as Graded</p>
                                       </TooltipContent>
                                     </Tooltip>
                                   </TooltipProvider>
                                 )}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExpanded(item.id)}
                              >
                                {expandedItems.has(item.id) ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {expandedItems.has(item.id) && (
                            <div className="mt-4 pt-4 border-t space-y-3">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="font-medium">Cost:</span> ${item.cost || '0'}
                                </div>
                                <div>
                                  <span className="font-medium">Created:</span> {new Date(item.created_at).toLocaleString()}
                                </div>
                                <div>
                                  <span className="font-medium">Type:</span> {item.type || 'Raw'}
                                </div>
                                {item.printed_at && (
                                  <div>
                                    <span className="font-medium">Printed:</span> {formatDistanceToNow(new Date(item.printed_at), { addSuffix: true })}
                                  </div>
                                )}
                                {item.pushed_at && (
                                  <div>
                                    <span className="font-medium">Pushed:</span> {formatDistanceToNow(new Date(item.pushed_at), { addSuffix: true })}
                                  </div>
                                )}
                                {item.sold_at && (
                                  <div>
                                    <span className="font-medium">Sold:</span> {formatDistanceToNow(new Date(item.sold_at), { addSuffix: true })}
                                  </div>
                                )}
                                {item.sold_price && (
                                  <div>
                                    <span className="font-medium">Sold Price:</span> ${item.sold_price}
                                  </div>
                                )}
                              </div>
                              
                              {item.processing_notes && (
                                <div>
                                  <span className="font-medium text-sm">Notes:</span>
                                  <p className="text-sm text-muted-foreground mt-1">{item.processing_notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}

                    {filteredItems.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No inventory items found matching your filters.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        <ShopifyRemovalDialog
          isOpen={showRemovalDialog}
          onClose={() => {
            setShowRemovalDialog(false);
            setSelectedItemForRemoval(null);
          }}
          onConfirm={onRemovalConfirm}
          items={Array.isArray(selectedItemForRemoval) ? selectedItemForRemoval : (selectedItemForRemoval ? [selectedItemForRemoval] : [])}
          loading={bulkDeleting}
        />
        
        <ShopifySyncDetailsDialog
          open={!!syncDetailsRow}
          onOpenChange={(open) => !open && setSyncDetailsRow(null)}
          row={syncDetailsRow}
          selectedStoreKey={selectedStoreKey}
          selectedLocationGid={selectedLocationGid}
          onRefresh={() => {
            fetchItems();
            setSyncDetailsRow(null);
          }}
        />
      </div>
    </>
  );
};

export default Inventory;