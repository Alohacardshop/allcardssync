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
}

interface CurrentBatchPanelProps {
  onViewFullBatch?: () => void;
}

export const CurrentBatchPanel = ({ onViewFullBatch }: CurrentBatchPanelProps) => {
  const { assignedStore, selectedLocation } = useStore();
  const [recentItems, setRecentItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({ activeItems: 0, totalItems: 0 });
  const [editingItem, setEditingItem] = useState<IntakeItem | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to format card name
  const formatCardName = (item: IntakeItem) => {
    const parts = []
    
    if (item.year) parts.push(item.year)
    if (item.brand_title) parts.push(item.brand_title)
    if (item.card_number) parts.push(`#${item.card_number}`)
    if (item.subject) parts.push(item.subject)
    
    if (item.grade && item.psa_cert) {
      parts.push(`PSA ${item.grade}`)
    } else if (item.grade) {
      parts.push(`Grade ${item.grade}`)
    } else if (item.psa_cert) {
      parts.push(`PSA ${item.psa_cert}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
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
      setRecentItems(items || []);

      // Update counts
      setCounts({
        activeItems: items?.length || 0,
        totalItems: lot.total_items || 0
      });

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

  const handleSendBatchToInventory = async () => {
    if (recentItems.length === 0) {
      toast({ title: "Info", description: "No items to send" });
      return;
    }

    setSendingBatch(true);
    try {
      const itemIds = recentItems.map(item => item.id);
      const { data, error } = await supabase.rpc("send_intake_items_to_inventory", {
        item_ids: itemIds
      });

      if (error) throw error;

      toast({ title: "Success", description: `Sent ${(data as any)?.processed_ids?.length || itemIds.length} items to inventory` });
      fetchRecentItemsWithRetry();
    } catch (error: any) {
      console.error("Error sending batch to inventory:", error);
      toast({ title: "Error", description: error.message });
    } finally {
      setSendingBatch(false);
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Current Batch</CardTitle>
            <p className="text-sm text-muted-foreground">
              {counts.activeItems} active items
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSendBatchToInventory}
              disabled={recentItems.length === 0 || sendingBatch}
              size="sm"
            >
              {sendingBatch ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send to Inventory
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in current batch
            </div>
          ) : (
            <div className="space-y-3">
              {recentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{formatCardName(item)}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.sku} • ${item.price} • Qty: {item.quantity}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditItem(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSendToInventory(item.id)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {recentItems.length > 0 && (
            <div className="mt-4 pt-4 border-t flex gap-2">
              <Button
                variant="outline"
                onClick={handleClearBatch}
                size="sm"
              >
                Clear Batch
              </Button>
              <Button
                variant="outline"
                onClick={handleStartNewLot}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Start New Lot
              </Button>
              {onViewFullBatch && (
                <Button
                  variant="outline"
                  onClick={onViewFullBatch}
                  size="sm"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Batch
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {editingItem && (
        <EditIntakeItemDialog
          item={{
            id: editingItem.id,
            year: editingItem.year,
            brandTitle: editingItem.brand_title,
            subject: editingItem.subject,
            category: editingItem.category,
            variant: editingItem.variant,
            cardNumber: editingItem.card_number,
            grade: editingItem.grade,
            psaCert: editingItem.psa_cert,
            price: editingItem.price?.toString(),
            cost: editingItem.cost?.toString(),
            sku: editingItem.sku,
            quantity: editingItem.quantity
          }}
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          onSave={() => {
            setEditingItem(null);
            fetchRecentItemsWithRetry();
          }}
        />
      )}
    </>
  );
};
