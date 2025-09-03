import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, Eye, Package, Trash2, Send, Edit } from "lucide-react";
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

  const handleSendToInventory = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          processing_notes: 'Sent to inventory',
          removed_from_batch_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) {
        console.error('Inventory update error:', error);
        throw error;
      }

      toast.success('Item sent to inventory');
      fetchRecentItems(); // Refresh the list
    } catch (error) {
      console.error('Error sending item to inventory:', error);
      toast.error(`Error sending item to inventory: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Deleted from current batch',
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      toast.success('Item deleted');
      fetchRecentItems(); // Refresh the list
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error(`Error deleting item: ${error?.message || 'Unknown error'}`);
    }
  };

  const fetchRecentItems = async () => {
    try {
      // Get latest active lot
      const { data: latestLot } = await supabase
        .from('intake_lots')
        .select('lot_number')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestLot) {
        setRecentItems([]);
        setTotalCount(0);
        return;
      }

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
            {onViewFullBatch && (
              <Button variant="outline" size="sm" onClick={onViewFullBatch}>
                <Eye className="h-4 w-4 mr-2" />
                View Full Batch
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {[
                      item.category,
                      item.subject,
                      item.brand_title,
                      item.card_number && `#${item.card_number}`
                    ].filter(Boolean).join(' • ') || item.sku || 'Unknown Item'}
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
                      onClick={() => handleSendToInventory(item.id)}
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
                          <AlertDialogAction onClick={() => handleDeleteItem(item.id)}>
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