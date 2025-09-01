import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { Package, FileText, Plus, Trash2, Archive, Eye, ShoppingCart, CheckCircle, Edit3, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SystemStats } from "@/components/SystemStats";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Navigation } from "@/components/Navigation";
import { GradedCardIntake } from "@/components/GradedCardIntake";
import { RawCardIntake } from "@/components/RawCardIntake";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface IntakeItem {
  id: string;
  sku: string;
  subject: string;
  brand_title: string;
  category: string;
  quantity: number;
  price: number;
  cost?: number;
  grade?: string;
  psa_cert?: string;
  year?: string;
  card_number?: string;
  variant?: string;
  psa_cert_number?: string;
  lot_number: string;
  created_at: string;
  printed_at?: string;
  pushed_at?: string;
  deleted_at?: string;
}

export default function Index() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    price: string;
    quantity: string;
    subject: string;
    brand_title: string;
  }>({
    price: '',
    quantity: '',
    subject: '',
    brand_title: ''
  });
  const [loading, setLoading] = useState(true);
  const [batchNumber, setBatchNumber] = useState("");
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [processingBatch, setProcessingBatch] = useState(false);
  const { selectedStore, selectedLocation } = useStore();
  const { toast: toastHook } = useToast();

  const loadItems = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("intake_items")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (selectedStore) {
        query = query.eq("store_key", selectedStore);
      }
      if (selectedLocation) {
        query = query.eq("shopify_location_gid", selectedLocation);
      }

      const { data, error } = await query;

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error loading items:", error);
      toastHook({
        title: "Error",
        description: "Failed to load current batch",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [selectedStore, selectedLocation]);

  // Real-time update handler for intake items
  useEffect(() => {
    const handler = (e: any) => {
      const row = e.detail; // full intake_items row
      console.log('New item added to batch:', row);
      
      // Prepend the new item to the list for immediate feedback
      setItems(prevItems => [row, ...prevItems.slice(0, 99)]); // Keep only 100 items
    };
    
    window.addEventListener('intake:item-added', handler);
    return () => window.removeEventListener('intake:item-added', handler);
  }, []);

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(items.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleBatchAction = async (action: 'inventory' | 'complete') => {
    if (selectedItems.size === 0) return;

    try {
      const selectedItemsList = items.filter(item => selectedItems.has(item.id));
      
      switch (action) {
        case 'inventory':
          // Update items to mark as sent to inventory
          await supabase
            .from('intake_items')
            .update({ 
              pushed_at: new Date().toISOString(),
              processing_notes: 'Sent to inventory'
            })
            .in('id', Array.from(selectedItems));
          
          toast.success(`${selectedItems.size} items sent to inventory`);
          break;
          
        case 'complete':
          // Mark batch as completed
          const lotNumbers = [...new Set(selectedItemsList.map(item => item.lot_number))];
          
          await supabase
            .from('intake_lots')
            .update({ status: 'completed' })
            .in('lot_number', lotNumbers);
            
          await supabase
            .from('intake_items')
            .update({ 
              pushed_at: new Date().toISOString(),
              processing_notes: 'Batch completed'
            })
            .in('id', Array.from(selectedItems));
          
          toast.success(`Batch completed for ${selectedItems.size} items`);
          break;
      }
      
      // Refetch data and clear selection
      await loadItems();
      setSelectedItems(new Set());
      
    } catch (error) {
      console.error('Batch action error:', error);
      toast.error('Failed to process batch action');
    }
  };

  const handleSingleItemAction = async (itemId: string, action: 'inventory') => {
    try {
      await supabase
        .from('intake_items')
        .update({ 
          pushed_at: new Date().toISOString(),
          processing_notes: 'Sent to inventory'
        })
        .eq('id', itemId);
      
      toast.success('Item sent to inventory');
      await loadItems();
      
    } catch (error) {
      console.error('Single item action error:', error);
      toast.error('Failed to send item to inventory');
    }
  };

  const startEditing = (item: IntakeItem) => {
    setEditingItem(item.id);
    setEditForm({
      price: item.price?.toString() || '',
      quantity: item.quantity?.toString() || '',
      subject: item.subject || '',
      brand_title: item.brand_title || ''
    });
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setEditForm({
      price: '',
      quantity: '',
      subject: '',
      brand_title: ''
    });
  };

  const saveEdit = async (itemId: string) => {
    try {
      await supabase
        .from('intake_items')
        .update({
          price: parseFloat(editForm.price) || 0,
          quantity: parseInt(editForm.quantity) || 1,
          subject: editForm.subject,
          brand_title: editForm.brand_title
        })
        .eq('id', itemId);
      
      toast.success('Item updated successfully');
      setEditingItem(null);
      await loadItems();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save changes');
    }
  };

  const handleBatchItems = async () => {
    if (selectedItems.size === 0) {
      toastHook({
        title: "No items selected",
        description: "Please select items to batch",
        variant: "destructive",
      });
      return;
    }

    if (!batchNumber.trim()) {
      toastHook({
        title: "Batch number required",
        description: "Please enter a batch number",
        variant: "destructive",
      });
      return;
    }

    setProcessingBatch(true);
    try {
      // Update all selected items with the batch number
      const { error } = await supabase
        .from("intake_items")
        .update({ lot_number: batchNumber.trim() })
        .in("id", Array.from(selectedItems));

      if (error) throw error;

      toastHook({
        title: "Batch created successfully",
        description: `${selectedItems.size} items added to batch ${batchNumber}`,
      });

      // Clear selections and refresh
      setSelectedItems(new Set());
      setBatchNumber("");
      setBatchDialogOpen(false);
      await loadItems();
    } catch (error) {
      console.error("Error batching items:", error);
      toastHook({
        title: "Error",
        description: "Failed to create batch",
        variant: "destructive",
      });
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleDeleteItems = async () => {
    if (selectedItems.size === 0) {
      toastHook({
        title: "No items selected",
        description: "Please select items to delete",
        variant: "destructive",
      });
      return;
    }

    try {
      // Soft delete by setting deleted_at timestamp
      const { error } = await supabase
        .from("intake_items")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: "Batch deletion from dashboard"
        })
        .in("id", Array.from(selectedItems));

      if (error) throw error;

      toastHook({
        title: "Items deleted",
        description: `${selectedItems.size} items have been deleted`,
      });

      // Clear selections and refresh
      setSelectedItems(new Set());
      await loadItems();
    } catch (error) {
      console.error("Error deleting items:", error);
      toastHook({
        title: "Error", 
        description: "Failed to delete items",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSingleItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("intake_items")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: "Individual deletion from dashboard"
        })
        .eq("id", itemId);

      if (error) throw error;

      toast.success("Item deleted successfully");
      await loadItems();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete item");
    }
  };

  const handleDeleteEntireBatch = async () => {
    if (items.length === 0) {
      toastHook({
        title: "No items to delete",
        description: "Current batch is empty",
        variant: "destructive",
      });
      return;
    }

    const currentLotNumber = items[0]?.lot_number;
    const lotItems = items.filter(item => item.lot_number === currentLotNumber);
    
    try {
      // Try to use admin_delete_batch RPC function first
      const lotRecord = await supabase
        .from('intake_lots')
        .select('id')
        .eq('lot_number', currentLotNumber)
        .single();

      if (lotRecord.data?.id) {
        const { error: rpcError } = await supabase.rpc('admin_delete_batch', {
          lot_id_in: lotRecord.data.id,
          reason_in: 'Entire batch deleted from dashboard'
        });

        if (!rpcError) {
          toastHook({
            title: "Batch deleted",
            description: `${lotItems.length} items deleted from batch ${currentLotNumber}`,
          });
          await loadItems();
          return;
        }
      }

      // Fallback: individual soft delete
      const { error } = await supabase
        .from("intake_items")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_reason: "Entire batch deletion from dashboard"
        })
        .eq("lot_number", currentLotNumber);

      if (error) throw error;

      toastHook({
        title: "Batch deleted",
        description: `${lotItems.length} items deleted from batch ${currentLotNumber}`,
      });
      await loadItems();
    } catch (error) {
      console.error("Error deleting batch:", error);
      toastHook({
        title: "Error",
        description: "Failed to delete batch",
        variant: "destructive",
      });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const formatItemTitle = (item: IntakeItem) => {
    const parts: string[] = [];

    // Year
    if (item.year) parts.push(item.year);

    // Brand / Set (uppercase)
    if (item.brand_title) parts.push(item.brand_title.toUpperCase());

    // Card number
    if (item.card_number) parts.push(`#${item.card_number}`);

    // Subject (uppercase but keep certain suffixes like "ex" lowercase)
    if (item.subject) {
      let subj = item.subject.toUpperCase();
      // Preserve common lowercase suffix tokens
      subj = subj.replace(/\bEX\b/g, "ex");
      parts.push(subj);
    }

    // Variant / Rarity (uppercase)
    if (item.variant) parts.push(item.variant.toUpperCase());

    // Grade -> always render as "PSA X" when grade is present
    if (item.grade) {
      const gradeStr = String(item.grade).trim();
      const numMatch = gradeStr.match(/(\d+(?:\.\d+)?)/);
      const numeric = numMatch?.[1];

      if (/psa/i.test(gradeStr)) {
        // If PSA already present, normalize to "PSA <num|text>"
        const cleaned = gradeStr.replace(/psa/i, "").trim();
        const cleanedNum = cleaned.match(/(\d+(?:\.\d+)?)/)?.[1];
        parts.push(`PSA ${cleanedNum ?? cleaned.toUpperCase()}`);
      } else {
        parts.push(`PSA ${numeric ?? gradeStr.toUpperCase()}`);
      }
    }

    return parts.join(" ") || item.subject || "Untitled Item";
  };

  const getItemType = (item: IntakeItem) => {
    const brandLower = item.brand_title?.toLowerCase() || '';
    const categoryLower = item.category?.toLowerCase() || '';
    const subjectLower = item.subject?.toLowerCase() || '';
    
    if (brandLower.includes('pokemon') || categoryLower.includes('pokemon') || subjectLower.includes('pokemon')) {
      return 'Pokemon';
    }
    if (brandLower.includes('magic') || categoryLower.includes('magic') || brandLower.includes('mtg')) {
      return 'Magic: The Gathering';
    }
    
    return item.category || 'Trading Card';
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex gap-2">
            <Link to="/bulk-import">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
            </Link>
            {selectedItems.size > 0 && (
              <>
                <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Archive className="h-4 w-4 mr-2" />
                    Batch ({selectedItems.size})
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Batch</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="batchNumber">Batch Number</Label>
                      <Input
                        id="batchNumber"
                        value={batchNumber}
                        onChange={(e) => setBatchNumber(e.target.value)}
                        placeholder="Enter batch number..."
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedItems.size} items will be added to this batch
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button 
                      variant="outline" 
                      onClick={() => setBatchDialogOpen(false)}
                      disabled={processingBatch}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleBatchItems}
                      disabled={processingBatch}
                    >
                      {processingBatch ? "Creating..." : "Create Batch"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete ({selectedItems.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Items</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedItems.size} selected items? 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteItems}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </>
            )}
          </div>
        </div>
        
        <SystemStats />

        {/* Single Card Entry Forms */}
        <Card>
          <CardHeader>
            <CardTitle>Single Card Entry</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add individual graded or raw cards to inventory
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="graded" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="graded">Graded Card</TabsTrigger>
                <TabsTrigger value="raw">Raw Card</TabsTrigger>
              </TabsList>
              <TabsContent value="graded" className="mt-6">
                <GradedCardIntake />
              </TabsContent>
              <TabsContent value="raw" className="mt-6">
                <RawCardIntake />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Recent Inventory Items */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Current Batch
              {items.length > 0 && items[0]?.lot_number && (
                <Badge variant="outline" className="ml-2">
                  {items[0].lot_number}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBatchAction('inventory')}
                    disabled={selectedItems.size === 0}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Send to Inventory
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleBatchAction('complete')}
                    disabled={selectedItems.size === 0}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Batch
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Entire Batch
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Entire Batch</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete the entire batch? This will delete {items.filter(item => item.lot_number === items[0]?.lot_number).length} items from batch {items[0]?.lot_number}. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteEntireBatch}>
                          Delete Batch
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <Checkbox
                checked={selectedItems.size === items.length && items.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label>Select All</Label>
            </div>
          </div>
          {items.length > 0 && (
            <div className="text-sm text-muted-foreground mt-2">
              {items.length} items • {selectedItems.size} selected • 
              Total value: ${items.filter(item => selectedItems.has(item.id))
                .reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No items in current batch</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                    selectedItems.has(item.id) ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={(checked) => 
                      handleSelectItem(item.id, checked as boolean)
                    }
                  />
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                    {editingItem === item.id ? (
                      // Edit mode
                      <>
                        <div>
                          <Input
                            value={editForm.subject}
                            onChange={(e) => setEditForm(prev => ({...prev, subject: e.target.value}))}
                            className="text-sm"
                            placeholder="Subject"
                          />
                          <p className="text-sm text-muted-foreground">{item.sku}</p>
                        </div>
                        
                        <div>
                          <Input
                            value={editForm.brand_title}
                            onChange={(e) => setEditForm(prev => ({...prev, brand_title: e.target.value}))}
                            className="text-sm"
                            placeholder="Brand Title"
                          />
                          <p className="text-sm text-muted-foreground">{item.category}</p>
                        </div>

                        <div>
                          <Input
                            type="number"
                            value={editForm.quantity}
                            onChange={(e) => setEditForm(prev => ({...prev, quantity: e.target.value}))}
                            className="text-sm"
                            placeholder="Quantity"
                            min="1"
                          />
                          <p className="text-sm text-muted-foreground">
                            Lot: {item.lot_number}
                          </p>
                        </div>

                        <div>
                          <Input
                            type="number"
                            value={editForm.price}
                            onChange={(e) => setEditForm(prev => ({...prev, price: e.target.value}))}
                            className="text-sm"
                            placeholder="Price"
                            step="0.01"
                          />
                          {item.cost && (
                            <p className="text-xs text-muted-foreground">
                              Cost: {formatPrice(item.cost)}
                            </p>
                          )}
                          {item.grade && (
                            <p className="text-xs text-muted-foreground">
                              Grade: {item.grade}
                            </p>
                          )}
                          {item.psa_cert && (
                            <p className="text-xs text-muted-foreground">
                              PSA #{item.psa_cert}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1 items-center">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => saveEdit(item.id)}
                            className="h-6 px-2"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEditing}
                            className="h-6 px-2"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      // View mode
                      <>
                        <div>
                          <p className="font-medium">{formatItemTitle(item)}</p>
                          <p className="text-sm text-muted-foreground">{item.sku}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm">{item.brand_title}</p>
                          <p className="text-sm text-muted-foreground">{getItemType(item)}</p>
                        </div>

                        <div>
                          <p className="text-sm">Qty: {item.quantity}</p>
                          <p className="text-sm text-muted-foreground">
                            Lot: {item.lot_number}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium">{formatPrice(item.price)}</p>
                          {item.cost && (
                            <p className="text-xs text-muted-foreground">
                              Cost: {formatPrice(item.cost)}
                            </p>
                          )}
                          {item.grade && (
                            <p className="text-xs text-muted-foreground">
                              Grade: {item.grade}
                            </p>
                          )}
                          {item.psa_cert && (
                            <p className="text-xs text-muted-foreground">
                              PSA #{item.psa_cert}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1 items-center flex-wrap">
                          {item.printed_at && (
                            <Badge variant="default" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              Printed
                            </Badge>
                          )}
                          {item.pushed_at && (
                            <Badge variant="secondary" className="text-xs">
                              Pushed
                            </Badge>
                          )}
                          {!item.pushed_at && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSingleItemAction(item.id, 'inventory')}
                                className="h-6 px-2 text-xs"
                              >
                                <Package className="h-3 w-3 mr-1" />
                                Inventory
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(item)}
                            className="h-6 px-2"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Item</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{item.subject}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSingleItem(item.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
