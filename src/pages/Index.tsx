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
import { Package, FileText, Plus, Trash2, Archive, Eye } from "lucide-react";
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
  lot_number: string;
  created_at: string;
  printed_at?: string;
  pushed_at?: string;
  deleted_at?: string;
}

export default function Index() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [batchNumber, setBatchNumber] = useState("");
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [processingBatch, setProcessingBatch] = useState(false);
  const { selectedStore, selectedLocation } = useStore();
  const { toast } = useToast();

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
      toast({
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

  const handleBatchItems = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No items selected",
        description: "Please select items to batch",
        variant: "destructive",
      });
      return;
    }

    if (!batchNumber.trim()) {
      toast({
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

      toast({
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
      toast({
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
      toast({
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

      toast({
        title: "Items deleted",
        description: `${selectedItems.size} items have been deleted`,
      });

      // Clear selections and refresh
      setSelectedItems(new Set());
      await loadItems();
    } catch (error) {
      console.error("Error deleting items:", error);
      toast({
        title: "Error", 
        description: "Failed to delete items",
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
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedItems.size === items.length && items.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label>Select All</Label>
            </div>
          </div>
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
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                    selectedItems.has(item.id) ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={(checked) => 
                      handleSelectItem(item.id, checked as boolean)
                    }
                  />
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-2">
                    <div>
                      <p className="font-medium">{item.subject}</p>
                      <p className="text-sm text-muted-foreground">{item.sku}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm">{item.brand_title}</p>
                      <p className="text-sm text-muted-foreground">{item.category}</p>
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
                        <p className="text-sm text-muted-foreground">
                          Cost: {formatPrice(item.cost)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {item.grade && (
                        <Badge variant="outline" className="text-xs">
                          {item.grade}
                        </Badge>
                      )}
                      {item.psa_cert && (
                        <Badge variant="secondary" className="text-xs">
                          PSA #{item.psa_cert}
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-1">
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
                    </div>
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
