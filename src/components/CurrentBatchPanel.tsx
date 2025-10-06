import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Send, Trash2, Eye, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import EditIntakeItemDialog from "./EditIntakeItemDialog";
import { useStore } from "@/contexts/StoreContext";
import { logStoreContext, validateCompleteStoreContext } from "@/utils/storeValidation";
import { StoreContextDebug } from "./StoreContextDebug";
import { useBatchSendToShopify } from '@/hooks/useBatchSendToShopify';
import { useBatchAutoProcessSettings } from '@/hooks/useBatchAutoProcessSettings';
import { BatchConfigDialog } from '@/components/BatchConfigDialog';
import { BatchProgressDialog } from '@/components/BatchProgressDialog';

interface IntakeItem {
  id: string;
  subject?: string;
  brand_title?: string;
  sku?: string;
  card_number?: string;
  quantity: number;
  price: number;
  cost?: number;
  lot_number: string;
  lot_id?: string;
  type?: string;
  processing_notes?: string;
  printed_at?: string;
  pushed_at?: string;
  removed_from_batch_at?: string;
  created_at: string;
  psa_cert?: string;
  grade?: string;
  variant?: string;
  category?: string;
  year?: string;
  catalog_snapshot?: any;
  store_key?: string;
  shopify_location_gid?: string;
  image_urls?: string[];
}

interface CurrentBatchPanelProps {
  onViewFullBatch?: () => void;
  onBatchCountUpdate?: (count: number) => void;
  compact?: boolean;
}

export const CurrentBatchPanel = ({ onViewFullBatch, onBatchCountUpdate, compact = false }: CurrentBatchPanelProps) => {
  const { assignedStore, selectedLocation } = useStore();
  const [recentItems, setRecentItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({ activeItems: 0, totalItems: 0 });
  const [editingItem, setEditingItem] = useState<IntakeItem | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const [batchConfigOpen, setBatchConfigOpen] = useState(false);
  const [batchProgressOpen, setBatchProgressOpen] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sendChunkedBatchToShopify, isSending, progress } = useBatchSendToShopify();
  const { getAutoProcessConfig, getProcessingMode } = useBatchAutoProcessSettings();

  // Helper to format card name
  const formatCardName = (item: IntakeItem) => {
    const parts = []
    
    // Add year at the start if available (check both direct field and catalog_snapshot)
    const year = item.year || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'year' in item.catalog_snapshot ? item.catalog_snapshot.year : null);
    if (year) parts.push(year)
    
    // Add brand/set
    if (item.brand_title) parts.push(item.brand_title)
    
    // Add subject (like card name)
    if (item.subject) parts.push(item.subject)
    
    // Add card number
    if (item.card_number) parts.push(`#${item.card_number}`)
    
    // Handle grading - use PSA for PSA certs
    if (item.grade && item.psa_cert) {
      parts.push(`PSA ${item.grade}`)
    } else if (item.grade) {
      parts.push(`Grade ${item.grade}`)
    } else if (item.psa_cert) {
      parts.push(`PSA ${item.psa_cert}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
  }

  // Helper to get condition for raw cards
  const getCondition = (item: IntakeItem) => {
    // For raw cards, check catalog_snapshot for condition
    if (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null) {
      if ('condition' in item.catalog_snapshot && item.catalog_snapshot.condition) {
        return item.catalog_snapshot.condition;
      }
    }
    
    // Fallback to variant if no condition found
    const variant = item.variant || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot ? item.catalog_snapshot.varietyPedigree : null);
    return variant;
  }

  // Helper to get additional variant info (like foil)
  const getVariantInfo = (item: IntakeItem) => {
    if (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null) {
      const parts = [];
      
      // Add foil if present
      if ('foil' in item.catalog_snapshot && item.catalog_snapshot.foil) {
        parts.push('Foil');
      }
      
      // Add language if not English
      if ('language' in item.catalog_snapshot && item.catalog_snapshot.language && item.catalog_snapshot.language !== 'English') {
        parts.push(item.catalog_snapshot.language);
      }
      
      // Add variant from item if present and not a condition
      if (item.variant && !['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].includes(item.variant)) {
        parts.push(item.variant);
      }
      
      return parts.join(', ');
    }
    
    // Fallback to item variant if no catalog_snapshot
    if (item.variant && !['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].includes(item.variant)) {
      return item.variant;
    }
    
    return null;
  }

  const canDeleteFromBatch = (item: IntakeItem) => {
    return !item.removed_from_batch_at;
  };

  const isBulkItem = (item: IntakeItem) => {
    return item.variant === 'Bulk' || 
           (item.catalog_snapshot && 
            typeof item.catalog_snapshot === 'object' && 
            item.catalog_snapshot !== null &&
            'type' in item.catalog_snapshot && 
            item.catalog_snapshot.type === 'card_bulk');
  };

  // Enhanced fetch with retry logic
  const fetchRecentItemsWithRetry = useCallback(async (retries = 3): Promise<void> => {
    // If context is missing, wait and retry
    if (!selectedLocation && retries > 0) {
      console.log(`[CurrentBatchPanel] Location missing, retrying in 500ms... (${retries} retries left)`);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = setTimeout(() => {
        fetchRecentItemsWithRetry(retries - 1);
      }, 500);
      return;
    }
    
    // If still no location after retries, try to get it from the active lot
    if (!selectedLocation && assignedStore) {
      try {
        const { data: activeLot } = await supabase
          .from('intake_lots')
          .select('shopify_location_gid')
          .eq('store_key', assignedStore)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (activeLot?.shopify_location_gid) {
          console.log('[CurrentBatchPanel] Recovered location from active lot:', activeLot.shopify_location_gid);
          return fetchRecentItems(assignedStore, activeLot.shopify_location_gid);
        }
      } catch (error) {
        console.error('[CurrentBatchPanel] Failed to recover location from active lot:', error);
      }
    }
    
    return fetchRecentItems(assignedStore, selectedLocation);
  }, [assignedStore, selectedLocation]);

  // Fetch recent items from the current batch
  const fetchRecentItems = async (storeKey?: string, locationGid?: string) => {
    const store = storeKey || assignedStore;
    const location = locationGid || selectedLocation;
    
    if (!store || !location) {
      console.error('[CurrentBatchPanel] Store context missing:', { store, location });
      return;
    }

    logStoreContext('CurrentBatchPanel.fetchRecentItems', { assignedStore: store, selectedLocation: location });

    try {
      validateCompleteStoreContext({ assignedStore: store, selectedLocation: location }, 'fetch batch items');
      
      setLoading(true);
      
      // First get the current lot for this user and store/location
      const { data: lot, error: lotError } = await supabase
        .from("intake_lots")
        .select("*")
        .eq("status", "active")
        .eq("store_key", store)
        .eq("shopify_location_gid", location)
        .eq("created_by", (await supabase.auth.getUser()).data.user?.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lotError) {
        console.error("Error fetching lot:", lotError);
        return;
      }

      if (!lot) {
        console.log(`[CurrentBatchPanel] No active lot found for store: ${store}, location: ${location}`);
        setRecentItems([]);
        setCounts({ activeItems: 0, totalItems: 0 });
        if (onBatchCountUpdate) {
          onBatchCountUpdate(0);
        }
        return;
      }

      // Then get recent items from this lot
      const { data: items, error: itemsError } = await supabase
        .from("intake_items")
        .select("*")
        .eq("lot_id", lot.id)
        .is("deleted_at", null)
        .is("removed_from_batch_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (itemsError) {
        console.error("Error fetching items:", itemsError);
        return;
      }

      console.log(`[CurrentBatchPanel] Loaded ${items?.length || 0} items from lot ${lot.lot_number}`);
      // Cast the database items to our interface with proper type handling
      const typedItems: IntakeItem[] = (items || []).map(item => ({
        ...item,
        image_urls: Array.isArray(item.image_urls) ? 
          (item.image_urls as any[]).map(url => String(url)) : 
          item.image_urls ? [String(item.image_urls)] : []
      }));
      setRecentItems(typedItems);

      // Update counts
      const newCounts = {
        activeItems: items?.length || 0,
        totalItems: lot.total_items || 0
      };
      setCounts(newCounts);

      // Notify parent of batch count update
      if (onBatchCountUpdate) {
        onBatchCountUpdate(newCounts.activeItems);
      }

    } catch (error) {
      console.error("Error in fetchRecentItems:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: IntakeItem) => {
    setEditingItem(item);
  };

  const handleSendToInventory = async (itemId: string) => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    try {
      const { data, error } = await supabase.rpc("send_intake_item_to_inventory", {
        item_id: itemId
      });

      if (error) throw error;

      toast({ title: "Success", description: "Item sent to inventory" });
      fetchRecentItemsWithRetry();
    } catch (error: any) {
      console.error("Error sending to inventory:", error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase.rpc("soft_delete_intake_item", {
        item_id: itemId,
        reason_in: "Deleted from current batch"
      });

      if (error) throw error;

      toast({ title: "Success", description: "Item removed from batch" });
      fetchRecentItemsWithRetry();
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleClearBatch = async () => {
    if (recentItems.length === 0) {
      toast({ title: "Info", description: "No items to clear" });
      return;
    }

    try {
      // Delete all items in current batch
      const itemIds = recentItems.map(item => item.id);
      const { error } = await supabase.rpc("soft_delete_intake_items", {
        ids: itemIds,
        reason: "Batch cleared"
      });

      if (error) throw error;

      toast({ title: "Success", description: "Batch cleared" });
      fetchRecentItemsWithRetry();
    } catch (error: any) {
      console.error("Error clearing batch:", error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleStartNewLot = async () => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("force_new_lot", {
        _store_key: assignedStore,
        _location_gid: selectedLocation,
        _reason: "Manually started new lot"
      });

      if (error) throw error;

      toast({ title: "Success", description: "New lot started" });
      fetchRecentItemsWithRetry();
    } catch (error: any) {
      console.error("Error starting new lot:", error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleSendBatchToShopify = async () => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    const itemIds = recentItems.map(item => item.id);
    if (itemIds.length === 0) {
      toast({ title: "Info", description: "No items in current batch" });
      return;
    }

    console.log('🛍️ [CurrentBatchPanel] Starting batch send to Shopify:', {
      itemCount: itemIds.length,
      storeKey: assignedStore,
      locationGid: selectedLocation
    });

    // Always show configuration dialog for vendor selection and batch settings
    setBatchConfigOpen(true);
  };

  const handleManualBatchConfig = async (config: any) => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    const itemIds = recentItems.map(item => item.id);
    setBatchConfigOpen(false);
    setBatchProgressOpen(true);
    
    try {
      const result = await sendChunkedBatchToShopify(
        itemIds,
        assignedStore as "hawaii" | "las_vegas",
        selectedLocation,
        config,
        undefined,
        false // manual config
      );
      
      if (result.ok) {
        await fetchRecentItemsWithRetry();
        toast({ title: "Success", description: `Processed ${result.processed} items successfully` });
      }
    } catch (error) {
      console.error('Manual batch processing failed:', error);
      toast({ title: "Error", description: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setBatchProgressOpen(false);
    }
  };

  // Load items when store context changes
  useEffect(() => {
    if (assignedStore) {
      fetchRecentItemsWithRetry();
    }
  }, [assignedStore, selectedLocation, lastAddedItemId, fetchRecentItemsWithRetry]);

  // Event-based refresh listener
  useEffect(() => {
    const handleBatchItemAdded = (event: CustomEvent) => {
      console.log('[CurrentBatchPanel] Item added event received:', event.detail);
      
      // Only refresh if it's for our current store
      if (event.detail.store === assignedStore) {
        setLastAddedItemId(event.detail.itemId);
        // Also directly fetch to ensure refresh happens
        fetchRecentItemsWithRetry();
      }
    };
    
    window.addEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
    return () => window.removeEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
  }, [assignedStore]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Batch</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className={`flex flex-row items-center justify-between space-y-0 ${compact ? 'pb-2' : 'pb-4'}`}>
          <div>
            <CardTitle className={compact ? 'text-lg' : ''}>Current Batch</CardTitle>
            <p className="text-sm text-muted-foreground">
              {counts.activeItems} active items
            </p>
          </div>
          {!compact && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSendBatchToShopify();
                }}
                disabled={recentItems.length === 0 || isSending}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send to Inventory
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {recentItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in current batch
            </div>
          ) : (
            <div className="space-y-3">
              {recentItems.slice(0, compact ? 5 : recentItems.length).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between ${compact ? 'p-2' : 'p-3'} border rounded-lg group hover:bg-muted/50`}
                >
                  <div className="flex-1 cursor-pointer" onClick={() => handleEditItem(item)}>
                    <div className={`font-medium ${compact ? 'text-sm' : ''}`}>{formatCardName(item)}</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>
                        {compact ? (
                          `$${item.price} • Qty: ${item.quantity}`
                        ) : (
                          `${item.sku} • $${item.price} ${item.cost && `• Cost: $${Number(item.cost).toFixed(2)}`} • Qty: ${item.quantity}`
                        )}
                      </div>
                      {/* Show condition for raw cards only */}
                      {getCondition(item) && (
                        <div className="text-xs">
                          <span className="font-medium">Condition:</span> {getCondition(item)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`flex gap-1 ${compact ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'gap-2'}`}>
                    {compact && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditItem(item)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {!compact && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditItem(item);
                          }}
                          style={{ position: 'relative', zIndex: 9999 }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSendToInventory(item.id);
                          }}
                          style={{ position: 'relative', zIndex: 9999 }}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={compact ? "ghost" : "outline"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
                      className={compact ? "h-8 w-8 p-0 text-destructive hover:text-destructive" : ""}
                      style={{ position: 'relative', zIndex: 9999 }}
                    >
                      <Trash2 className={compact ? "h-3 w-3" : "h-4 w-4"} />
                    </Button>
                  </div>
                </div>
              ))}
              {compact && recentItems.length > 5 && (
                <div className="text-center text-sm text-muted-foreground pt-2">
                  ... and {recentItems.length - 5} more items
                </div>
              )}
            </div>
          )}
          
          {recentItems.length > 0 && !compact && (
            <div className="mt-4 pt-4 border-t flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClearBatch();
                }}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                Clear Batch
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleStartNewLot();
                }}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Start New Lot
              </Button>
              {onViewFullBatch && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onViewFullBatch?.();
                  }}
                  size="sm"
                  style={{ position: 'relative', zIndex: 9999 }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Batch
                </Button>
              )}
            </div>
          )}
          
          {compact && recentItems.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSendBatchToShopify();
                }}
                disabled={recentItems.length === 0 || sendingBatch}
                style={{ position: 'relative', zIndex: 9999 }}
                size="sm"
                className="w-full"
              >
                {sendingBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send to Inventory
              </Button>
              <Button
                variant="outline"
                onClick={() => window.dispatchEvent(new CustomEvent('switchToBatchTab'))}
                size="sm"
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Full Batch
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {editingItem && (
        <EditIntakeItemDialog
          item={{
            id: editingItem.id,
            year: editingItem.year || (editingItem.catalog_snapshot?.year) || '',
            brandTitle: editingItem.brand_title || (editingItem.catalog_snapshot?.set) || '',
            subject: editingItem.subject || (editingItem.catalog_snapshot?.name) || '',
            category: editingItem.category,
            variant: editingItem.variant || 
                    (editingItem.catalog_snapshot?.foil ? 'Foil' : '') || 
                    (editingItem.catalog_snapshot?.varietyPedigree) || '',
            condition: editingItem.catalog_snapshot?.condition || 
                      (editingItem.variant?.includes('Near Mint') ? 'Near Mint' : 
                       editingItem.variant?.includes('Lightly Played') ? 'Lightly Played' :
                       editingItem.variant?.includes('Moderately Played') ? 'Moderately Played' :
                       editingItem.variant?.includes('Heavily Played') ? 'Heavily Played' :
                       editingItem.variant?.includes('Damaged') ? 'Damaged' : ''),
            cardNumber: editingItem.card_number || (editingItem.catalog_snapshot?.number) || '',
            grade: editingItem.grade,
            psaCert: editingItem.psa_cert || (editingItem.catalog_snapshot?.psaCert) || '',
            price: editingItem.price?.toString() || (editingItem.catalog_snapshot?.entered_price?.toString()) || '',
            cost: editingItem.cost?.toString() || (editingItem.catalog_snapshot?.calculated_cost?.toString()) || '',
            sku: editingItem.sku || (editingItem.catalog_snapshot?.tcgplayer_id) || '',
            quantity: editingItem.quantity,
            imageUrl: editingItem.image_urls?.[0] || 
                     (editingItem.catalog_snapshot?.photo_url) ||
                     (editingItem.catalog_snapshot?.image_url) || 
                     (editingItem.catalog_snapshot?.imageUrl) || 
                     (editingItem.catalog_snapshot?.image_urls?.[0]) || ''
          }}
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          onSave={async (values) => {
            try {
              console.log('Saving item with values:', values);
              
              // Update the intake item in the database
              const { error } = await supabase
                .from('intake_items')
                .update({
                  year: values.year,
                  brand_title: values.brandTitle,
                  subject: values.subject,
                  category: values.category,
                  variant: values.variant,
                  card_number: values.cardNumber,
                  grade: values.grade,
                  psa_cert: values.psaCert,
                  price: values.price ? parseFloat(values.price) : null,
                  cost: values.cost ? parseFloat(values.cost) : null,
                  sku: values.sku,
                  quantity: values.quantity,
                  image_urls: values.imageUrl ? [values.imageUrl] : null,
                  // Update catalog_snapshot with new values to preserve TCGPlayer data
                  catalog_snapshot: editingItem.catalog_snapshot ? {
                    ...editingItem.catalog_snapshot,
                    name: values.subject,
                    set: values.brandTitle,
                    number: values.cardNumber,
                    condition: values.condition || editingItem.catalog_snapshot.condition,
                    foil: values.variant?.toLowerCase().includes('foil') || editingItem.catalog_snapshot.foil,
                    entered_price: values.price ? parseFloat(values.price) : editingItem.catalog_snapshot.entered_price,
                    calculated_cost: values.cost ? parseFloat(values.cost) : editingItem.catalog_snapshot.calculated_cost,
                    photo_url: values.imageUrl || editingItem.catalog_snapshot.photo_url,
                    image_urls: values.imageUrl ? [values.imageUrl] : editingItem.catalog_snapshot.image_urls
                  } : null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', values.id);

              if (error) {
                console.error('Error updating item:', error);
                toast({
                  title: "Error",
                  description: "Failed to update item. Please try again.",
                  variant: "destructive",
                });
                return;
              }

              toast({
                title: "Success",
                description: "Item updated successfully!",
              });
              
              setEditingItem(null);
              fetchRecentItemsWithRetry();
            } catch (error) {
              console.error('Error updating item:', error);
              toast({
                title: "Error", 
                description: "Failed to update item. Please try again.",
                variant: "destructive",
              });
            }
          }}
        />
      )}

      {/* Batch Configuration Dialog */}
      <BatchConfigDialog
        itemCount={recentItems.length}
        onStartBatch={handleManualBatchConfig}
        open={batchConfigOpen}
        onOpenChange={setBatchConfigOpen}
        storeKey={assignedStore || undefined}
        locationGid={selectedLocation || undefined}
      />

      {/* Batch Progress Dialog */}
      <BatchProgressDialog
        open={batchProgressOpen}
        progress={progress}
        onCancel={() => setBatchProgressOpen(false)}
      />
    </>
  );
};
