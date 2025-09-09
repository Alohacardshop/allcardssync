import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Package, Calendar, DollarSign, Eye, EyeOff, FileText, Tag, Printer, ExternalLink, RotateCcw, Loader2, Upload, Home } from 'lucide-react';
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
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StoreLocationSelector } from '@/components/StoreLocationSelector';
import { Navigation } from '@/components/Navigation';
import BarcodeLabel from '@/components/BarcodeLabel';
import { usePrintNode } from '@/hooks/usePrintNode';
import { Link } from 'react-router-dom';

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
  const [syncingAll, setSyncingAll] = useState(false);
  const [printingItem, setPrintingItem] = useState<string | null>(null);
  
  const { printPNG, selectedPrinter } = usePrintNode();

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
        query = query.is('deleted_at', null).eq('quantity', 0);
      } else if (statusFilter === 'deleted') {
        query = query.not('deleted_at', 'is', null);
      } else if (statusFilter === 'errors') {
        query = query.is('deleted_at', null).eq('shopify_sync_status', 'error');
      }
      // 'all' shows everything, no additional filters

      // Apply store/location filters
      if (selectedStoreKey) {
        query = query.eq('store_key', selectedStoreKey);
      }
      if (selectedLocationGid) {
        query = query.eq('shopify_location_gid', selectedLocationGid);
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
  }, [statusFilter, selectedStoreKey, selectedLocationGid]);

  // F) Manual sync retry function
  const retrySync = async (item: any) => {
    try {
      const { error } = await supabase.functions.invoke('shopify-sync-inventory', {
        body: {
          storeKey: item.store_key,
          sku: item.sku,
          locationGid: item.shopify_location_gid
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
              const { error } = await supabase.functions.invoke('shopify-sync-inventory', {
                body: item
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

  const syncToShopify = async (item: any) => {
    try {
      const { error } = await supabase.functions.invoke('shopify-sync-inventory', {
        body: {
          storeKey: item.store_key,
          sku: item.sku,
          locationGid: item.shopify_location_gid
        }
      });

      if (error) throw error;
      toast.success('Sync to Shopify initiated');
      fetchItems();
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Failed to sync to Shopify');
    }
  };

  const handleRemoveFromShopify = (item: any) => {
    setSelectedItemForRemoval(item);
    setShowRemovalDialog(true);
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
              </div>
              <Button
                onClick={syncAllVisible}
                disabled={syncingAll || filteredItems.length === 0}
                className="ml-auto"
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
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Store & Location Filter */}
              <StoreLocationSelector className="max-w-md" showSetDefault={false} />
              
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

                  <div className="space-y-4">
                    {filteredItems.map((item) => (
                      <Card key={item.id} className={cn(
                        "transition-all duration-200",
                        item.deleted_at && "bg-muted/50 border-destructive/20"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
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
                                {[
                                  item.year,
                                  item.brand_title,
                                  item.card_number ? `#${item.card_number}` : null,
                                  item.subject,
                                  item.variant
                                ].filter(Boolean).join(' ')}
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
                                          item.shopify_sync_status === 'synced' ? 'default' : 
                                          item.shopify_sync_status === 'error' ? 'destructive' : 
                                          'secondary'
                                        }
                                      >
                                        {item.shopify_sync_status || 'pending'}
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
                                  onClick={() => syncToShopify(item)}
                                  disabled={!item.sku || !item.store_key}
                                >
                                  <ExternalLink className="w-4 h-4 mr-1" />
                                  Sync
                                </Button>
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
                            <div className="mt-4 pt-4 border-t">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Price</p>
                                  <p>${item.price}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Cost</p>
                                  <p>${item.cost || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Created</p>
                                  <p>{new Date(item.created_at).toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Updated</p>
                                  <p>{new Date(item.updated_at).toLocaleDateString()}</p>
                                </div>
                                {item.removed_from_batch_at && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Moved to Inventory</p>
                                    <p>{new Date(item.removed_from_batch_at).toLocaleDateString()}</p>
                                  </div>
                                )}
                                {/* B) Only show printed info for non-graded items */}
                                {item.type !== 'Graded' && item.printed_at && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Printed</p>
                                    <p>{new Date(item.printed_at).toLocaleDateString()}</p>
                                  </div>
                                )}
                                {/* C) Show sold information when present */}
                                {item.sold_at && (
                                  <>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Sold Price</p>
                                      <p>${item.sold_price || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Sold Date</p>
                                      <p>{new Date(item.sold_at).toLocaleDateString()}</p>
                                    </div>
                                    {item.shopify_order_id && (
                                      <div className="col-span-2">
                                        <p className="text-sm font-medium text-muted-foreground">Shopify Order</p>
                                        <p className="text-sm text-blue-600">#{item.shopify_order_id}</p>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>

                              {item.processing_notes && (
                                <div className="mt-4">
                                  <p className="text-sm font-medium text-muted-foreground mb-1">Processing Notes</p>
                                  <p className="text-sm bg-muted p-2 rounded">{item.processing_notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}

                    {filteredItems.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No inventory items found
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {showRemovalDialog && selectedItemForRemoval && (
          <ShopifyRemovalDialog
            isOpen={showRemovalDialog}
            loading={isRemoving}
            onClose={() => {
              setShowRemovalDialog(false);
              setSelectedItemForRemoval(null);
            }}
            items={[selectedItemForRemoval]}
            onConfirm={async (mode) => {
              setIsRemoving(true);
              try {
                const { data, error } = await supabase.functions.invoke('shopify-remove-or-zero', {
                  body: {
                    storeKey: selectedItemForRemoval.store_key,
                    mode: mode,
                    sku: selectedItemForRemoval.sku,
                    productId: selectedItemForRemoval.shopify_product_id,
                    locationGid: selectedItemForRemoval.shopify_location_gid
                  }
                });

                if (error) throw error;
                
                console.debug('Shopify removal response:', data);
                
                const actionText = data?.mode === 'graded' ? 'deleted from' : 'zeroed in';
                toast.success(`Item ${actionText} Shopify (mode: ${data?.mode})`);
                
                setShowRemovalDialog(false);
                setSelectedItemForRemoval(null);
                fetchItems();
              } catch (error: any) {
                console.error('Shopify removal failed:', error);
                const errorMessage = error?.message || 'Failed to remove item from Shopify';
                if (errorMessage.includes('Could not resolve product ID')) {
                  toast.error('Item not found in Shopify. It may need to be synced first.');
                } else {
                  toast.error(errorMessage);
                }
              } finally {
                setIsRemoving(false);
              }
            }}
          />
        )}
      </div>
    </>
  );
};

export default Inventory;
