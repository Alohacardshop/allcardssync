import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, Eye, Package, Trash2, Send, Edit, Eraser, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import EditIntakeItemDialog, { IntakeItemDetails } from "@/components/EditIntakeItemDialog";
import { useStore } from "@/contexts/StoreContext";
import { useBatchSendToShopify } from "@/hooks/useBatchSendToShopify";
import { QueueStatusIndicator } from "@/components/QueueStatusIndicator";

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
  catalog_snapshot?: any; // Using any to match the Json type from database
  store_key?: string;
  shopify_location_gid?: string;
}

interface CurrentBatchPanelProps {
  onViewFullBatch?: () => void;
}

export const CurrentBatchPanel = ({ onViewFullBatch }: CurrentBatchPanelProps) => {
  const [recentItems, setRecentItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [editItem, setEditItem] = useState<IntakeItemDetails | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentLotId, setCurrentLotId] = useState<string | null>(null);
  const [currentLotNumber, setCurrentLotNumber] = useState<string | null>(null);
  const [startingNewLot, setStartingNewLot] = useState(false);
  const [sendingBatchToInventory, setSendingBatchToInventory] = useState(false);
  const [batchSendProgress, setBatchSendProgress] = useState({ total: 0, completed: 0, failed: 0, inProgress: false });
  const [sendingItemIds, setSendingItemIds] = useState<Set<string>>(new Set()); // Track individual item sends
  const { assignedStore, selectedLocation } = useStore();
  const { sendChunkedBatchToShopify, isSending } = useBatchSendToShopify();

  // Helper to format card name like "1996 POKEMON JAPANESE BASIC #150 MEWTWO-HOLO PSA 8"
  const formatCardName = (item: IntakeItem) => {
    const parts = []
    
    // Add year if available
    if (item.year) {
      parts.push(item.year)
    }
    
    // Add brand/set name
    if (item.brand_title) {
      parts.push(item.brand_title)
    }
    
    // Add card number with # prefix
    if (item.card_number) {
      parts.push(`#${item.card_number}`)
    }
    
    // Add subject (card name)
    if (item.subject) {
      parts.push(item.subject)
    }
    
    // Add grade info
    if (item.grade && item.psa_cert) {
      parts.push(`PSA ${item.grade}`)
    } else if (item.grade) {
      parts.push(`Grade ${item.grade}`)
    } else if (item.psa_cert) {
      parts.push(`PSA ${item.psa_cert}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
  }

  // Helper to determine if user can delete from current batch
  const canDeleteFromBatch = (item: IntakeItem) => {
    return !!currentLotId && item.lot_id === currentLotId && !item.removed_from_batch_at;
  };

  // Helper to determine if item is bulk and should skip Shopify sync
  const isBulkItem = (item: IntakeItem) => {
    return item.variant === 'Bulk' || 
           (item.catalog_snapshot && 
            typeof item.catalog_snapshot === 'object' && 
            item.catalog_snapshot !== null &&
            'type' in item.catalog_snapshot && 
            item.catalog_snapshot.type === 'card_bulk');
  };

  const handleEditItem = (item: IntakeItem) => {
    const editDetails: IntakeItemDetails = {
      id: item.id,
      year: item.year,
      brandTitle: item.brand_title,
      subject: item.subject,
      category: item.category,
      variant: item.variant,
      cardNumber: item.card_number,
      grade: item.grade,
      psaCert: item.psa_cert,
      price: item.price?.toString(),
      cost: item.cost?.toString(),
      sku: item.sku,
      quantity: item.quantity
    };
    setEditItem(editDetails);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (editedItem: IntakeItemDetails) => {
    try {
      const { error } = await supabase
        .from('intake_items')
        .update({
          year: editedItem.year,
          brand_title: editedItem.brandTitle,
          subject: editedItem.subject,
          category: editedItem.category,
          variant: editedItem.variant,
          card_number: editedItem.cardNumber,
          grade: editedItem.grade,
          psa_cert: editedItem.psaCert,
          price: editedItem.price ? parseFloat(editedItem.price) : null,
          cost: editedItem.cost ? parseFloat(editedItem.cost) : null,
          sku: editedItem.sku,
          quantity: editedItem.quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', editedItem.id);

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      toast.success('Item updated successfully');
      setEditDialogOpen(false);
      setEditItem(null);
      fetchRecentItems(); // Refresh the list
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error(`Error updating item: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleSendToInventory = async (item: IntakeItem) => {
    if (!assignedStore || !selectedLocation) {
      toast.error("Please select a store and location first");
      return;
    }

    if (sendingItemIds.has(item.id)) {
      console.log(`Item ${item.id} is already being sent, ignoring duplicate request`);
      return; // Prevent double-clicks
    }

    try {
      setSendingItemIds(prev => new Set(prev.add(item.id))); // Mark as sending
      
      // Use the improved batching function that handles inventory + queue
      const result = await sendChunkedBatchToShopify([item.id], assignedStore as "hawaii" | "las_vegas", selectedLocation);
      
      if (result.processed > 0) {
        // Optimistic UI update for immediate feedback
        setRecentItems((prev) => prev.filter((i) => i.id !== item.id));
        setTotalCount((c) => Math.max(0, (c || 0) - 1));

        // Small delay to allow DB triggers to run before refetching
        setTimeout(async () => {
          await fetchRecentItems();
          await checkAndCloseEmptyLot();
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error processing item:', error);
      toast.error(`Error processing item: ${error?.message || 'Unknown error'}`);
    } finally {
      setSendingItemIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      }); // Remove from sending state
    }
  };

  // Send entire batch to inventory
  const handleSendBatchToInventory = async () => {
    if (!assignedStore || !selectedLocation) {
      toast.error('Please select a store and location first');
      return;
    }

    if (recentItems.length === 0) {
      toast.error('No items in batch to send to inventory');
      return;
    }

    // Only include items that haven't been sent to inventory yet
    const itemsToSend = recentItems.filter(item => !item.removed_from_batch_at);
    
    if (itemsToSend.length === 0) {
      toast.error('All items in batch have already been sent to inventory');
      return;
    }

    if (isSending || sendingBatchToInventory) {
      console.log('Batch send already in progress, ignoring duplicate request');
      return; // Prevent double-clicks
    }

    setSendingBatchToInventory(true);
    setBatchSendProgress({ total: itemsToSend.length, completed: 0, failed: 0, inProgress: true });

    const correlationId = `batch_send_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`🚀 [${correlationId}] Starting chunked batch send to inventory:`, { 
      itemCount: itemsToSend.length, 
      store: assignedStore,
      location: selectedLocation 
    });
    
    try {
      const response = await sendChunkedBatchToShopify(
        itemsToSend.map(item => item.id),
        assignedStore as "hawaii" | "las_vegas",
        selectedLocation,
        { batchSize: 8, delayBetweenChunks: 1000, failFast: false },
        (progress) => {
          // Update progress using the hook's progress tracking
          setBatchSendProgress({ 
            total: progress.totalItems, 
            completed: progress.processedItems, 
            failed: 0, // We'll calculate this from the final response
            inProgress: progress.isProcessing
          });
        }
      );
      
      // Final progress update
      setBatchSendProgress({ 
        total: itemsToSend.length, 
        completed: response.shopify_success || 0, 
        failed: response.shopify_errors || 0, 
        inProgress: false
      });

      console.log(`📊 [${correlationId}] Batch send completed:`, response);
      
      // Refresh the batch view
      await fetchRecentItems();
      
      // Trigger empty lot check after successful batch send
      if (response.processed > 0) {
        window.dispatchEvent(new CustomEvent('batch:items-sent-to-inventory'));
        
        const queuedCount = response.shopify_success || 0;
        const inventoryCount = response.processed || 0;
        
        if (queuedCount > 0) {
          toast.success(
            `✅ ${inventoryCount} items added to inventory and ${queuedCount} queued for Shopify sync`, 
            {
              action: {
                label: "View Queue",
                onClick: () => window.location.href = '/admin#queue'
              }
            }
          );
        } else {
          toast.success(`✅ ${inventoryCount} items added to inventory`);
        }
      }
      
      if (response.shopify_errors > 0 || response.rejected > 0) {
        const totalErrors = (response.shopify_errors || 0) + (response.rejected || 0);
        toast.error(`❌ ${totalErrors} items failed to process`);
      }
      
    } catch (error: any) {
      console.error(`💥 [${correlationId}] Batch send failed:`, error);
      setBatchSendProgress({ total: 0, completed: 0, failed: itemsToSend.length, inProgress: false });
    } finally {
      setSendingBatchToInventory(false);
    }
  };

  const handleDeleteItem = async (item: IntakeItem) => {
    try {
      console.log('🗑️ DELETE ITEM CLICKED - Starting delete for item:', item.id);

      const { data, error, status } = await supabase.rpc('soft_delete_intake_item', {
        item_id: item.id,
        reason_in: 'Deleted from current batch'
      });

      console.log('🗑️ RPC Response:', { data, error, status });

      if (error) {
        console.error('🗑️ [delete] RPC error', { status, ...error });
        
        // Check if it's a permission error (item already in inventory or not in active batch)
        if (error.message?.includes('Access denied') || error.message?.includes('Only admins')) {
          toast.error("Can't delete: only admins can delete inventory or other batches.");
          return;
        }
        
        // Try direct update fallback for other errors
        console.log('🗑️ Trying fallback update method...');
        const { error: fbError } = await supabase
          .from('intake_items')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_reason: 'fallback delete from batch',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .select('id')
          .maybeSingle();

        if (fbError) {
          console.error('🗑️ [delete] fallback failed', fbError);
          if (fbError.message?.includes('Only admins') || fbError.message?.includes('Access denied')) {
            toast.error("Can't delete: only admins can delete inventory or other batches.");
          } else {
            toast.error(`Delete failed: ${fbError.message || fbError.details || 'unknown error'}`);
          }
          return;
        }
        
        console.log('🗑️ Fallback delete successful');
        toast.success('Removed from current batch.');
      } else {
        console.log('🗑️ RPC delete successful');
        if (isAdmin) {
          toast.success('Item deleted successfully');
        } else {
          toast.success('Removed from current batch.');
        }
      }

      console.log('🗑️ Successfully deleted item:', data);
      
      // Optimistic UI update for immediate feedback
      setRecentItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotalCount((c) => Math.max(0, (c || 0) - 1));

      // Small delay to allow DB triggers to run before refetching, then check if we should close empty lot
      setTimeout(async () => {
        await fetchRecentItems();
        await checkAndCloseEmptyLot();
      }, 150);
    } catch (error: any) {
      console.error('🗑️ Error deleting item:', error);
      if (error?.message?.includes('Access denied') || error?.message?.includes('Only admins')) {
        toast.error("Can't delete: only admins can delete inventory or other batches.");
      } else {
        toast.error(`Error deleting item: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const handleClearBatch = async () => {
    console.log('🧹 CLEAR BATCH CLICKED - Current lot ID:', currentLotId);
    
    if (!currentLotId) {
      console.log('🧹 No active batch to clear');
      toast.error('No active batch to clear');
      return;
    }

    try {
      console.log('🧹 Calling admin_delete_batch RPC...');
      const { data, error } = await supabase.rpc('admin_delete_batch', {
        lot_id_in: currentLotId,
        reason_in: 'Batch cleared manually for testing'
      });

      console.log('🧹 RPC Response:', { data, error });

      if (error) {
        console.error('🧹 Error clearing batch:', error);
        toast.error(`Error clearing batch: ${error.message}`);
        return;
      }

      console.log('🧹 Successfully cleared batch');
      toast.success(`Cleared batch: ${data} items deleted`);
      
      // Refresh the batch data
      fetchRecentItems();
    } catch (error: any) {
      console.error('🧹 Error clearing batch:', error);
      toast.error(`Error clearing batch: ${error?.message || 'Unknown error'}`);
    }
  };

  const checkAndCloseEmptyLot = async () => {
    if (!assignedStore || !selectedLocation) return;
    
    try {
      const { data, error } = await supabase.rpc('close_empty_lot_and_create_new', {
        _store_key: assignedStore,
        _location_gid: selectedLocation
      });

      if (error) {
        console.error('Error checking/closing empty lot:', error);
        return;
      }

      if (data && data.length > 0) {
        const result = data[0];
        if (result.old_lot_id !== result.new_lot_id) {
          console.log(`🔄 Closed empty lot ${result.old_lot_number}, created new lot ${result.new_lot_number}`);
          toast.success(`Started new lot ${result.new_lot_number}`);
          await fetchRecentItems();
        }
      }
    } catch (error) {
      console.error('Error in checkAndCloseEmptyLot:', error);
    }
  };

  const handleStartNewLot = async () => {
    if (!assignedStore || !selectedLocation) {
      toast.error('Please select a store and location first');
      return;
    }

    try {
      setStartingNewLot(true);
      const { data, error } = await supabase.rpc('force_new_lot', {
        _store_key: assignedStore,
        _location_gid: selectedLocation,
        _reason: 'Manually started new lot'
      });

      if (error) {
        console.error('Error starting new lot:', error);
        toast.error(`Error starting new lot: ${error.message}`);
        return;
      }

      if (data && data.length > 0) {
        const result = data[0];
        console.log(`🆕 Started new lot ${result.new_lot_number} (closed ${result.old_lot_number})`);
        toast.success(`Started new lot ${result.new_lot_number}`);
        await fetchRecentItems();
      }
    } catch (error: any) {
      console.error('Error starting new lot:', error);
      toast.error(`Error starting new lot: ${error?.message || 'Unknown error'}`);
    } finally {
      setStartingNewLot(false);
    }
  };

  const fetchRecentItems = async () => {
    try {
      // Get latest active lot scoped by user/store/location
      let lotQuery = supabase
        .from('intake_lots')
        .select('id, lot_number')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      // Scope by store/location if available
      if (assignedStore) {
        lotQuery = lotQuery.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        lotQuery = lotQuery.eq('shopify_location_gid', selectedLocation);
      }

      const { data: latestLot } = await lotQuery.maybeSingle();

      if (!latestLot) {
        setRecentItems([]);
        setTotalCount(0);
        setCurrentLotId(null);
        setCurrentLotNumber(null);
        return;
      }

      setCurrentLotId(latestLot.id);
      setCurrentLotNumber(latestLot.lot_number);

      // Get total count
      const { count } = await supabase
        .from('intake_items')
        .select('id', { count: 'exact' })
        .eq('lot_number', latestLot.lot_number)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null);

      // Get recent items (last 20)
      const { data: items } = await supabase
        .from('intake_items')
        .select('*')
        .eq('lot_number', latestLot.lot_number)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentItems(items || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching recent items:', error);
      toast.error('Error loading current batch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if user is admin
    const checkAdminRole = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: adminCheck } = await supabase.rpc("has_role", { 
            _user_id: session.session.user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(adminCheck));
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    };

    checkAdminRole();
    fetchRecentItems();

    // Set up realtime subscription
    const channel = supabase
      .channel('intake-items-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intake_items'
        },
        () => {
          fetchRecentItems();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'intake_items'
        },
        () => {
          fetchRecentItems();
        }
      )
      .subscribe();

    // Listen for custom events from intake forms
    const handleItemAdded = () => {
      fetchRecentItems();
    };

    // Listen for batch items sent to inventory (from Index page bulk send)
    const handleBatchSentToInventory = async () => {
      await fetchRecentItems();
      await checkAndCloseEmptyLot();
    };

    window.addEventListener('intake:item-added', handleItemAdded);
    window.addEventListener('batch:items-sent-to-inventory', handleBatchSentToInventory);
    
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('intake:item-added', handleItemAdded);
      window.removeEventListener('batch:items-sent-to-inventory', handleBatchSentToInventory);
    };
  }, []);

  if (loading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Current Batch
          </CardTitle>
          <CardDescription>Loading recent batch items...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Current Batch
          </CardTitle>
          <CardDescription>No items in current batch</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
               <CardTitle className="text-lg flex items-center gap-2">
                 <Archive className="h-5 w-5" />
                 Current Batch
                 <Badge variant="secondary" className="ml-2">
                   {totalCount} items
                 </Badge>
                 {currentLotNumber && (
                   <Badge variant="outline" className="ml-1 text-xs">
                     Lot #{currentLotNumber}
                   </Badge>
                 )}
               </CardTitle>
              <CardDescription>Recent items added to the batch</CardDescription>
            </div>
            <div className="flex gap-2">
              <QueueStatusIndicator />
              {onViewFullBatch && (
                <Button variant="outline" size="sm" onClick={onViewFullBatch}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Batch
                </Button>
              )}
              {totalCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSendBatchToInventory}
                  disabled={sendingBatchToInventory || recentItems.filter(item => !item.removed_from_batch_at).length === 0}
                  className="text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50"
                >
                  <Package className={`h-4 w-4 mr-2 ${sendingBatchToInventory ? 'animate-pulse' : ''}`} />
                  {sendingBatchToInventory ? (
                    batchSendProgress.inProgress ? 
                      `Processing... (${batchSendProgress.completed}/${batchSendProgress.total})` : 
                      'Processing...'
                  ) : (
                    `Send to Inventory`
                  )}
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleStartNewLot}
                disabled={startingNewLot}
              >
                <RotateCcw className={`h-4 w-4 mr-2 ${startingNewLot ? 'animate-spin' : ''}`} />
                Start New Lot
              </Button>
              {isAdmin && totalCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Eraser className="h-4 w-4 mr-2" />
                      Clear Batch
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear Current Batch</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to clear the entire current batch? This will soft-delete all {totalCount} items in the batch. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => {
                        console.log('🧹 CLEAR BATCH BUTTON CLICKED IN DIALOG');
                        handleClearBatch();
                      }} className="bg-red-600 hover:bg-red-700">
                        Clear Batch
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                 <div className="flex-1">
                    <div className="font-medium text-sm">
                      {formatCardName(item)}
                    </div>
                   <div className="text-xs text-muted-foreground space-y-1">
                     <div>
                       Qty: {item.quantity} • ${(item.price || 0).toFixed(2)}
                       {item.cost && ` (Cost: $${item.cost.toFixed(2)})`}
                     </div>
                     {item.sku && (
                       <div className="text-muted-foreground">
                         SKU: {item.sku}
                       </div>
                     )}
                   </div>
                 </div>
                <div className="flex items-center gap-2">
                  {item.printed_at && (
                    <Badge variant="secondary" className="text-xs">Printed</Badge>
                  )}
                  {item.pushed_at && (
                    <Badge variant="secondary" className="text-xs">Pushed</Badge>
                  )}
                  
                  {/* Action buttons */}
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditItem(item)}
                      className="h-8 px-2 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                      title="Edit Item"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSendToInventory(item)}
                      disabled={sendingItemIds.has(item.id) || sendingBatchToInventory}
                      className="h-8 px-2 bg-green-50 hover:bg-green-100 border-green-200 text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={sendingItemIds.has(item.id) ? "Sending..." : "Send to Inventory"}
                    >
                      <Send className={`h-3 w-3 ${sendingItemIds.has(item.id) ? 'animate-pulse' : ''}`} />
                    </Button>
                    
                     {(isAdmin || canDeleteFromBatch(item)) && (
                       <AlertDialog>
                         <AlertDialogTrigger asChild>
                           <Button
                             size="sm"
                             variant="outline"
                             className="h-8 px-2 bg-red-50 hover:bg-red-100 border-red-200 text-red-700"
                             title="Delete Item"
                           >
                             <Trash2 className="h-3 w-3" />
                           </Button>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                           <AlertDialogHeader>
                             <AlertDialogTitle>Delete Item</AlertDialogTitle>
                             <AlertDialogDescription>
                               {isAdmin 
                                 ? "Are you sure you want to delete this item? This action cannot be undone."
                                 : "Are you sure you want to remove this item from the current batch? This action cannot be undone."
                               }
                             </AlertDialogDescription>
                           </AlertDialogHeader>
                           <AlertDialogFooter>
                             <AlertDialogCancel>Cancel</AlertDialogCancel>
                             <AlertDialogAction onClick={() => {
                               console.log('🗑️ DELETE BUTTON CLICKED IN DIALOG');
                               handleDeleteItem(item);
                             }}>
                               {isAdmin ? 'Delete' : 'Remove from Batch'}
                             </AlertDialogAction>
                           </AlertDialogFooter>
                         </AlertDialogContent>
                       </AlertDialog>
                     )}
                  </div>
                </div>
              </div>
            ))}
            {totalCount > recentItems.length && (
              <div className="text-center pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {totalCount - recentItems.length} more items in batch
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <EditIntakeItemDialog
        open={editDialogOpen}
        item={editItem}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveEdit}
      />
    </>
  );
};