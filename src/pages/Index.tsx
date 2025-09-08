import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Package, ShoppingCart, DollarSign, Trash2, Archive, Award, FileEdit } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTemplates } from "@/hooks/useTemplates";
import { Navigation } from "@/components/Navigation";
import { GradedCardIntake } from "@/components/GradedCardIntake";
import { RawCardIntake } from "@/components/RawCardIntake";
import { CurrentBatchPanel } from "@/components/CurrentBatchPanel";
import { StoreLocationSelector } from "@/components/StoreLocationSelector";

interface IntakeItem {
  id: string;
  card_name?: string;
  subject?: string;
  brand_title?: string;
  sku?: string;
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
  category?: string;
  catalog_snapshot?: any; // Match CurrentBatchPanel interface for consistent naming
}

interface SystemStats {
  total_items: number;
  total_value: number;
  items_printed: number;
  items_pushed: number;
}

const Index = () => {
  const [currentBatchItems, setCurrentBatchItems] = useState<IntakeItem[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("graded");
  const [sendProgress, setSendProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    inProgress: boolean;
    correlationId?: string;
  }>({ total: 0, completed: 0, failed: 0, inProgress: false });
  
  const { defaultTemplate } = useTemplates('raw');

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
        .maybeSingle();

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

    // Set up realtime subscription for system stats updates
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intake_items'
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Listen for custom events from intake forms as backup
    const handleItemAdded = () => {
      fetchData();
    };

    window.addEventListener('intake:item-added', handleItemAdded);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('intake:item-added', handleItemAdded);
    };
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
    if (itemIds.length === 0) {
      toast.error('Please select items to send to inventory');
      return;
    }

    const correlationId = `batch_send_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`🚀 [${correlationId}] Starting bulk send to inventory:`, { itemCount: itemIds.length, itemIds });
    
    try {
      setActionLoading(true);
      setSendProgress({ total: itemIds.length, completed: 0, failed: 0, inProgress: true, correlationId });

      // Process items concurrently with limited concurrency
      const CONCURRENCY_LIMIT = 3;
      const results = [];
      
      for (let i = 0; i < itemIds.length; i += CONCURRENCY_LIMIT) {
        const batch = itemIds.slice(i, i + CONCURRENCY_LIMIT);
        const batchPromises = batch.map(async (itemId) => {
          try {
            console.log(`📦 [${correlationId}] Processing item ${itemId}...`);
            
            const startTime = Date.now();
            const { data, error } = await supabase.rpc('send_intake_item_to_inventory', {
              item_id: itemId
            });

            if (error) {
              console.error(`❌ [${correlationId}] Failed to send item ${itemId}:`, error);
              return { success: false, itemId, error: error.message };
            }

            if (!data) {
              console.warn(`⚠️ [${correlationId}] No data returned for item ${itemId}`);
              return { success: false, itemId, error: 'No data returned (permission or not found)' };
            }

            const duration = Date.now() - startTime;
            console.log(`✅ [${correlationId}] Successfully sent item ${itemId} (${duration}ms):`, data);

            // Trigger Shopify sync in background (non-blocking) - skip for bulk items
            const itemIsBulk = data.variant === 'Bulk' || 
                              (data.catalog_snapshot && 
                               typeof data.catalog_snapshot === 'object' && 
                               data.catalog_snapshot !== null &&
                               'type' in data.catalog_snapshot && 
                               data.catalog_snapshot.type === 'card_bulk');
            
            if (data.sku && data.store_key && !itemIsBulk) {
              supabase.functions.invoke('shopify-sync-inventory', {
                body: {
                  storeKey: data.store_key,
                  sku: data.sku,
                  locationGid: data.shopify_location_gid,
                  correlationId
                }
              }).catch((syncError) => {
                console.warn(`⚠️ [${correlationId}] Shopify sync failed for ${itemId} (non-critical):`, syncError);
              });
            } else if (itemIsBulk) {
              console.log(`ℹ️ [${correlationId}] Skipping Shopify sync for bulk item ${itemId}`);
            }

            return { success: true, itemId, data };
          } catch (error: any) {
            console.error(`💥 [${correlationId}] Exception processing item ${itemId}:`, error);
            return { success: false, itemId, error: error?.message || 'Unknown error' };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Update progress
        const completed = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        setSendProgress(prev => ({ ...prev, completed, failed }));
      }

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      console.log(`📊 [${correlationId}] Bulk send completed:`, {
        total: itemIds.length,
        successful: successful.length,
        failed: failed.length,
        results
      });

      if (failed.length === 0) {
        toast.success(`Successfully sent ${successful.length} item(s) to inventory`);
      } else if (successful.length === 0) {
        toast.error(`Failed to send any items to inventory (${failed.length} failures)`);
      } else {
        toast.error(`Partially completed: ${successful.length} sent, ${failed.length} failed`);
      }
      
      // Clear selection and refresh, then check for empty lot closure
      setSelectedItems(new Set());
      setSelectAll(false);
      await fetchData();
      
      // Trigger empty lot check after successful batch send
      window.dispatchEvent(new CustomEvent('batch:items-sent-to-inventory'));
    } catch (error: any) {
      console.error(`💥 [${correlationId}] Bulk send failed:`, error);
      toast.error(`Error sending items to inventory: ${error?.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
      setSendProgress(prev => ({ ...prev, inProgress: false }));
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

  const handleCardPick = ({ card, chosenVariant }: {
    card: any;
    chosenVariant?: { condition: string; printing: string; price?: number };
  }) => {
    console.log('Card picked:', card, chosenVariant);
    toast.success(`Selected ${card.name || card.subject || 'card'}`);
  };

  const handleBatchAdd = async () => {
    toast.success('Item added to batch');
    await fetchData();
  };

  const handlePrintLabels = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    if (!defaultTemplate) {
      toast.error('No default template found. Please set a default template first.');
      return;
    }

    try {
      setActionLoading(true);

      // Create print jobs for selected items
      const printJobs = itemIds.map(itemId => ({
        workstation_id: 'dashboard',
        template_id: defaultTemplate.id,
        status: 'queued' as const,
        data: { intake_item_id: itemId },
        target: { type: 'intake_item', id: itemId },
        copies: 1
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
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <Navigation />
        </div>
      </header>

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

        {/* Store & Location Selector - with enhanced default functionality */}
        <div className="mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Store & Location Settings</h3>
              <Badge variant="outline" className="text-xs">Default: Store + Location</Badge>
            </div>
            <StoreLocationSelector showSetDefault={true} />
            <p className="text-xs text-muted-foreground mt-2">
              💡 Set your default store & location combination to save time on future intake sessions
            </p>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="graded" className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Graded Cards
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-2">
              <FileEdit className="h-4 w-4" />
              Raw Cards
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Current Batch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="graded" className="mt-6 space-y-6">
            <GradedCardIntake onBatchAdd={handleBatchAdd} />
            <CurrentBatchPanel onViewFullBatch={() => setActiveTab("batch")} />
          </TabsContent>

          <TabsContent value="raw" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Raw Cards Intake</CardTitle>
                <CardDescription>Add raw (ungraded) cards to inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <RawCardIntake 
                  onBatchAdd={handleBatchAdd}
                />
              </CardContent>
            </Card>
            <CurrentBatchPanel onViewFullBatch={() => setActiveTab("batch")} />
          </TabsContent>

          <TabsContent value="batch" className="mt-6">
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
                             disabled={actionLoading || sendProgress.inProgress}
                             className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                           >
                             {sendProgress.inProgress ? (
                               <>
                                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                 {sendProgress.completed}/{sendProgress.total} sent...
                               </>
                             ) : actionLoading ? (
                               <Loader2 className="h-4 w-4 animate-spin mr-2" />
                             ) : (
                               <Archive className="h-4 w-4 mr-2" />
                             )}
                             {!sendProgress.inProgress && !actionLoading && 'Send to Inventory'}
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
                            <div className="font-medium">
                              {(() => {
                                // Use catalog_snapshot for proper formatting (same as CurrentBatchPanel)
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
                            <div className="text-sm text-muted-foreground">
                              {item.set_name && `${item.set_name} • `}
                              {item.card_number && `#${item.card_number} • `}
                              Qty: {item.quantity} • ${(item.price || 0).toFixed(2)}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;