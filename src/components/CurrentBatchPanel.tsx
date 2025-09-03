import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, Eye, Package, Trash2, Send, Edit, Eraser } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import EditIntakeItemDialog, { IntakeItemDetails } from "@/components/EditIntakeItemDialog";

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
  processing_notes?: string;
  printed_at?: string;
  pushed_at?: string;
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
    try {
      console.log('Starting send to inventory for item:', item.id);

      const { data, error } = await supabase.rpc('send_intake_item_to_inventory', {
        item_id: item.id
      });

      if (error) {
        console.error('Send to inventory error:', error);
        toast.error(`Error sending item to inventory: ${error.message || 'Unknown error'}`);
        return;
      }

      if (!data) {
        console.warn('Send to inventory: no data returned for id', item.id);
        toast.error('Could not send item to inventory (no permission or not found).');
        return;
      }

      console.log('Successfully sent item to inventory:', data);
      toast.success('Item sent to inventory');

      // Optimistic UI update for immediate feedback
      setRecentItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotalCount((c) => Math.max(0, (c || 0) - 1));

      // Small delay to allow DB triggers to run before refetching
      setTimeout(() => {
        fetchRecentItems();
      }, 150);
    } catch (error: any) {
      console.error('Error sending item to inventory:', error);
      toast.error(`Error sending item to inventory: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleDeleteItem = async (item: IntakeItem) => {
    try {
      console.log('Starting delete for item:', item.id);

      const { data, error } = await supabase.rpc('soft_delete_intake_item', {
        item_id: item.id,
        reason_in: 'Deleted from current batch'
      });

      if (error) {
        console.error('Delete error:', error);
        toast.error(`Error deleting item: ${error.message || 'Unknown error'}`);
        return;
      }

      if (!data) {
        console.warn('Delete: no data returned for id', item.id);
        toast.error('Could not delete item (no permission or not found).');
        return;
      }

      console.log('Successfully deleted item:', data);
      toast.success('Item deleted');

      // Optimistic UI update for immediate feedback
      setRecentItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotalCount((c) => Math.max(0, (c || 0) - 1));

      // Small delay to allow DB triggers to run before refetching
      setTimeout(() => {
        fetchRecentItems();
      }, 150);
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error(`Error deleting item: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleClearBatch = async () => {
    if (!currentLotId) {
      toast.error('No active batch to clear');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('admin_delete_batch', {
        lot_id_in: currentLotId,
        reason_in: 'Batch cleared manually for testing'
      });

      if (error) {
        console.error('Error clearing batch:', error);
        toast.error(`Error clearing batch: ${error.message}`);
        return;
      }

      toast.success(`Cleared batch: ${data} items deleted`);
      
      // Refresh the batch data
      fetchRecentItems();
    } catch (error: any) {
      console.error('Error clearing batch:', error);
      toast.error(`Error clearing batch: ${error?.message || 'Unknown error'}`);
    }
  };

  const fetchRecentItems = async () => {
    try {
      // Get latest active lot
      const { data: latestLot } = await supabase
        .from('intake_lots')
        .select('id, lot_number')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestLot) {
        setRecentItems([]);
        setTotalCount(0);
        setCurrentLotId(null);
        return;
      }

      setCurrentLotId(latestLot.id);

      // Get total count
      const { count } = await supabase
        .from('intake_items')
        .select('id', { count: 'exact' })
        .eq('lot_number', latestLot.lot_number)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null);

      // Get recent items (last 5)
      const { data: items } = await supabase
        .from('intake_items')
        .select('*')
        .eq('lot_number', latestLot.lot_number)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null)
        .order('created_at', { ascending: false })
        .limit(5);

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

    window.addEventListener('intake:item-added', handleItemAdded);
    
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('intake:item-added', handleItemAdded);
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
              </CardTitle>
              <CardDescription>Recent items added to the batch</CardDescription>
            </div>
            <div className="flex gap-2">
              {onViewFullBatch && (
                <Button variant="outline" size="sm" onClick={onViewFullBatch}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Batch
                </Button>
              )}
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
                      <AlertDialogAction onClick={handleClearBatch} className="bg-red-600 hover:bg-red-700">
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
                    {(() => {
                      // Use catalog_snapshot for proper formatting
                      const catalog = item.catalog_snapshot;
                      if (catalog?.name && catalog?.set) {
                        const cardName = catalog.name.split(' - ')[0]; // Extract "Blaziken" from "Blaziken - 192/182"
                        const cardNumber = catalog.name.split(' - ')[1]; // Extract "192/182" from "Blaziken - 192/182"
                        const category = item.category || '';
                        const set = catalog.set;
                        
                        return `${category} ${cardName} ${set} • #${cardNumber}`.trim();
                      }
                      
                      // Fallback to original logic
                      const base = [item.category, item.subject, item.brand_title]
                        .filter(Boolean)
                        .join(' ');
                      const card = item.card_number ? ` • #${item.card_number}` : '';
                      const title = `${base}${card}`.trim();
                      return title || item.sku || 'Unknown Item';
                    })()}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Qty: {item.quantity} • ${(item.price || 0).toFixed(2)}
                      {item.cost && ` (Cost: $${item.cost.toFixed(2)})`}
                    </div>
                    <div>
                      {item.year && `${item.year} • `}
                      {item.variant && `${item.variant} • `}
                      {item.grade && `Condition: ${item.grade} • `}
                      {item.psa_cert && `PSA ${item.psa_cert}`}
                    </div>
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
                      className="h-8 px-2 bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                      title="Send to Inventory"
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                    
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
                            Are you sure you want to delete this item? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteItem(item)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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