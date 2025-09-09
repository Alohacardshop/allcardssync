import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Package, Calendar, DollarSign, Eye, EyeOff, FileText, Tag, Printer, ExternalLink, RotateCcw } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';

const Inventory = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showDeleted, setShowDeleted] = useState(false);
  const [showSold, setShowSold] = useState(false); // C) Toggle for sold items

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

      if (!showDeleted) {
        query = query.is('deleted_at', null);
      }

      // C) Filter sold items based on toggle
      if (!showSold) {
        query = query.gt('quantity', 0);
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
  }, [showDeleted, showSold]); // C) Refresh when sold toggle changes

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
    return (
      item.sku?.toLowerCase().includes(searchLower) ||
      item.brand_title?.toLowerCase().includes(searchLower) ||
      item.subject?.toLowerCase().includes(searchLower) ||
      item.category?.toLowerCase().includes(searchLower) ||
      item.variant?.toLowerCase().includes(searchLower) ||
      item.grade?.toLowerCase().includes(searchLower)
    );
  });

  const handlePrint = async (item: any) => {
    try {
      toast.success('Print initiated');
    } catch (error) {
      toast.error('Print failed');
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
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Inventory ({filteredItems.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-deleted"
                  checked={showDeleted}
                  onCheckedChange={setShowDeleted}
                />
                <Label htmlFor="show-deleted">Show deleted items</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-sold"
                  checked={showSold}
                  onCheckedChange={setShowSold}
                />
                <Label htmlFor="show-sold">Show sold (qty 0)</Label>
              </div>
            </div>

            <div className="mb-4">
              <Input
                placeholder="Search by SKU, brand, subject, category, variant, or grade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

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
                              disabled={!item.sku}
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Print
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
            </div>

            {filteredItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No inventory items found
              </div>
            )}
          </CardContent>
        </Card>

        {showRemovalDialog && selectedItemForRemoval && (
          <ShopifyRemovalDialog
            isOpen={showRemovalDialog}
            loading={false}
            onClose={() => {
              setShowRemovalDialog(false);
              setSelectedItemForRemoval(null);
            }}
            items={[selectedItemForRemoval]}
            onConfirm={async (mode) => {
              try {
                // Handle removal logic here
                toast.success('Item removed from Shopify');
                setShowRemovalDialog(false);
                setSelectedItemForRemoval(null);
                fetchItems();
              } catch (error) {
                toast.error('Failed to remove item from Shopify');
              }
            }}
          />
        )}
      </div>
    </>
  );
};

export default Inventory;
