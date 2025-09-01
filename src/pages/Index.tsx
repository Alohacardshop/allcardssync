import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Package, ShoppingCart, DollarSign, Trash2, Archive } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTemplateDefault } from "@/hooks/useTemplateDefault";

interface IntakeItem {
  id: string;
  card_name: string;
  set_name?: string;
  card_number?: string;
  quantity: number;
  price: number;
  lot_number: string;
  processing_notes?: string;
  printed_at?: string;
  pushed_at?: string;
  game?: string;
  created_at: string;
  updated_at: string;
  removed_from_batch_at?: string;
}

interface IntakeLot {
  id: string;
  lot_number: string;
  total_items: number;
  total_value: number;
  status: string;
  created_at: string;
}

interface SystemStats {
  total_items: number;
  total_value: number;
  items_printed: number;
  items_pushed: number;
}

const Index = () => {
  const [currentBatchItems, setCurrentBatchItems] = useState<IntakeItem[]>([]);
  const [recentLots, setRecentLots] = useState<IntakeLot[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  
  const { getDefaultTemplate } = useTemplateDefault();

  // Load default template
  useEffect(() => {
    const loadDefaultTemplate = async () => {
      try {
        const template = await getDefaultTemplate('raw');
        setDefaultTemplateId(template?.id || null);
      } catch (error) {
        console.error('Error loading default template:', error);
      }
    };
    loadDefaultTemplate();
  }, [getDefaultTemplate]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Get current batch items (latest lot, not removed from batch, not deleted)
      const { data: latestLot } = await supabase
        .from('intake_lots')
        .select('lot_number')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let currentBatch: IntakeItem[] = [];
      if (latestLot) {
        const { data: batchItems } = await supabase
          .from('intake_items')
          .select('*')
          .eq('lot_number', latestLot.lot_number)
          .is('deleted_at', null)
          .is('removed_from_batch_at', null)
          .order('created_at', { ascending: false });

        currentBatch = batchItems || [];
      }

      // Get recent lots
      const { data: lots } = await supabase
        .from('intake_lots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      // Get system stats
      const { data: stats } = await supabase
        .from('intake_items')
        .select('quantity, price, printed_at, pushed_at')
        .is('deleted_at', null);

      const systemStats: SystemStats = {
        total_items: stats?.reduce((sum, item) => sum + item.quantity, 0) || 0,
        total_value: stats?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0,
        items_printed: stats?.filter(item => item.printed_at).length || 0,
        items_pushed: stats?.filter(item => item.pushed_at).length || 0
      };

      setCurrentBatchItems(currentBatch);
      setRecentLots(lots || []);
      setSystemStats(systemStats);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(currentBatchItems.map(item => item.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleItemSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
    setSelectAll(newSelected.size === currentBatchItems.length);
  };

  const handleInventoryAction = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    try {
      setActionLoading(true);

      // Mark items as removed from batch
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          processing_notes: 'Sent to inventory',
          removed_from_batch_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (error) throw error;

      toast.success(`Successfully sent ${itemIds.length} item(s) to inventory`);
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      setSelectAll(false);
      await fetchData();
    } catch (error) {
      console.error('Error updating items:', error);
      toast.error('Error sending items to inventory');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteAction = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    try {
      setActionLoading(true);

      // Mark items as complete and removed from batch
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          processing_notes: 'Completed',
          removed_from_batch_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (error) throw error;

      toast.success(`Successfully completed ${itemIds.length} item(s)`);
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      setSelectAll(false);
      await fetchData();
    } catch (error) {
      console.error('Error updating items:', error);
      toast.error('Error completing items');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAction = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    try {
      setActionLoading(true);

      const { error } = await supabase
        .from('intake_items')
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Deleted from dashboard',
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (error) throw error;

      toast.success(`Successfully deleted ${itemIds.length} item(s)`);
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      setSelectAll(false);
      await fetchData();
    } catch (error) {
      console.error('Error deleting items:', error);
      toast.error('Error deleting items');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintLabels = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    if (!defaultTemplateId) {
      toast.error('No default template found. Please set a default template first.');
      return;
    }

    try {
      setActionLoading(true);

      // Create print jobs for selected items
      const printJobs = itemIds.map(itemId => ({
        intake_item_id: itemId,
        template_id: defaultTemplateId,
        status: 'queued' as const,
        workstation_id: 'dashboard',
        created_by: (await supabase.auth.getUser()).data.user?.id
      }));

      const { error: printError } = await supabase
        .from('print_jobs')
        .insert(printJobs);

      if (printError) throw printError;

      // Update items as printed
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({ 
          printed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (updateError) throw updateError;

      toast.success(`Successfully queued ${itemIds.length} label(s) for printing`);
      
      // Clear selection and refresh
      setSelectedItems(new Set());
      setSelectAll(false);
      await fetchData();
    } catch (error) {
      console.error('Error printing labels:', error);
      toast.error('Error printing labels');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.total_items || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${systemStats?.total_value?.toFixed(2) || '0.00'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Printed</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.items_printed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Pushed</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.items_pushed || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Current Batch */}
      <Card>
        <CardHeader>
          <CardTitle>Current Batch</CardTitle>
          <CardDescription>
            Items in the active batch that haven't been processed yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentBatchItems.length === 0 ? (
            <p className="text-muted-foreground">No items in current batch</p>
          ) : (
            <div className="space-y-4">
              {/* Selection controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all ({selectedItems.size} selected)
                  </span>
                </div>
                
                {/* Action buttons */}
                {selectedItems.size > 0 && (
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintLabels(Array.from(selectedItems))}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Print Labels"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInventoryAction(Array.from(selectedItems))}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      Inventory
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCompleteAction(Array.from(selectedItems))}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" disabled={actionLoading}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Items</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedItems.size} selected item(s)? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteAction(Array.from(selectedItems))}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {/* Items list */}
              <div className="space-y-2">
                {currentBatchItems.map((item) => (
                  <div key={item.id} className="flex items-center space-x-4 p-3 border rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => handleItemSelect(item.id)}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{item.card_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.set_name && `${item.set_name} • `}
                        {item.card_number && `#${item.card_number} • `}
                        Qty: {item.quantity} • ${item.price.toFixed(2)}
                        {item.game && ` • ${item.game}`}
                      </div>
                      {item.processing_notes && (
                        <div className="text-sm text-blue-600 mt-1">{item.processing_notes}</div>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      {item.printed_at && (
                        <Badge variant="secondary">Printed</Badge>
                      )}
                      {item.pushed_at && (
                        <Badge variant="default">Pushed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Lots */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Lots</CardTitle>
          <CardDescription>Recently created intake lots</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLots.length === 0 ? (
            <p className="text-muted-foreground">No recent lots</p>
          ) : (
            <div className="space-y-2">
              {recentLots.map((lot) => (
                <div key={lot.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{lot.lot_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {lot.total_items} items • ${lot.total_value.toFixed(2)}
                    </div>
                  </div>
                  <Badge variant={lot.status === 'active' ? 'default' : 'secondary'}>
                    {lot.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
