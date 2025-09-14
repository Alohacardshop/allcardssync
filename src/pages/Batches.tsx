import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { Search, Package, DollarSign, Calendar, Eye, History, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface IntakeLot {
  id: string;
  lot_number: string;
  lot_type: string;
  total_items: number;
  total_value: number;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  store_key?: string;
  shopify_location_gid?: string;
}

interface IntakeItem {
  id: string;
  lot_number: string;
  sku?: string;
  category?: string;
  grade?: string;
  price?: number;
  quantity: number;
  printed_at?: string;
  pushed_at?: string;
  created_at: string;
  brand_title?: string;
  subject?: string;
  card_number?: string;
  psa_cert?: string;
}

function useSEO({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    }
  }, [title, description]);
}

export default function Batches() {
  useSEO({ 
    title: "Batches | Inventory Management", 
    description: "View and manage intake batches with items, pricing, and processing status." 
  });

  const [lots, setLots] = useState<IntakeLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLot, setSelectedLot] = useState<IntakeLot | null>(null);
  const [lotItems, setLotItems] = useState<IntakeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const { toast } = useToast();
  const { assignedStore, selectedLocation } = useStore();

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .single();
          
          setIsAdmin(!!data && !error);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, []);

  const fetchLots = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('intake_lots')
        .select('*');

      // Filter by selected store and location
      if (selectedStore) {
        query = query.eq('store_key', selectedStore);
      }
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setLots(data || []);
    } catch (error) {
      console.error('Error fetching lots:', error);
      toast({
        title: "Error",
        description: "Failed to load batches",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLotItems = async (lotId: string) => {
    try {
      setLoadingItems(true);
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .eq('lot_id', lotId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setLotItems(data || []);
    } catch (error) {
      console.error('Error fetching lot items:', error);
      toast({
        title: "Error",
        description: "Failed to load batch items",
        variant: "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    fetchLots();
  }, [selectedStore, selectedLocation]); // Re-fetch when store/location changes

  const handleDeleteBatch = async (lotId: string, lotNumber: string) => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Admin role required to delete batches",
        variant: "destructive",
      });
      return;
    }

    setDeletingBatch(lotId);
    try {
      const { data, error } = await supabase.rpc('admin_delete_batch', {
        lot_id_in: lotId,
        reason_in: `Batch ${lotNumber} deleted via admin interface`
      });

      if (error) throw error;

      toast({
        title: "Batch Deleted",
        description: `Batch ${lotNumber} and ${data} items have been deleted`,
      });

      // Refresh the lots list
      await fetchLots();
      
      // Close the modal if it was open
      if (selectedLot?.id === lotId) {
        setSelectedLot(null);
      }

    } catch (error) {
      console.error('Error deleting batch:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete batch",
        variant: "destructive",
      });
    } finally {
      setDeletingBatch(null);
    }
  };

  const filteredLots = lots.filter(lot => {
    const matchesSearch = searchTerm === "" || 
      lot.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || lot.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleViewLot = async (lot: IntakeLot) => {
    setSelectedLot(lot);
    await fetchLotItems(lot.id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'processing': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      case 'archived': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getTotalStats = () => {
    return filteredLots.reduce((acc, lot) => {
      acc.totalItems += lot.total_items || 0;
      acc.totalValue += Number(lot.total_value) || 0;
      return acc;
    }, { totalItems: 0, totalValue: 0 });
  };

  const stats = getTotalStats();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Batches</h1>
            <p className="text-muted-foreground mt-1">View and manage intake batches and their items</p>
          </div>
          <Navigation />
        </div>
      </header>


      <div className="container mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Batches</p>
                  <p className="text-lg font-semibold">{filteredLots.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-lg font-semibold">{stats.totalItems.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-lg font-semibold">${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Batches</p>
                  <p className="text-lg font-semibold">{lots.filter(lot => lot.status === 'active').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search batches..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-input bg-background rounded-md text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Batches Table */}
        <Card>
          <CardHeader>
            <CardTitle>Batches ({filteredLots.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading batches...</div>
            ) : filteredLots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No batches found matching your criteria
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-mono">{lot.lot_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {lot.lot_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`text-white ${getStatusColor(lot.status)}`}
                        >
                          {lot.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{lot.total_items || 0}</TableCell>
                      <TableCell>
                        ${Number(lot.total_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{format(new Date(lot.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewLot(lot)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && lot.status !== 'deleted' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingBatch === lot.id}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Batch</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete batch "{lot.lot_number}"? 
                                    This will soft-delete all {lot.total_items || 0} items in this batch. 
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteBatch(lot.id, lot.lot_number)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete Batch
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lot Details Modal */}
      <Dialog open={!!selectedLot} onOpenChange={() => setSelectedLot(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Batch Details - {selectedLot?.lot_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLot && (
            <div className="space-y-6">
              {/* Batch Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline">{selectedLot.lot_type}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={`text-white ${getStatusColor(selectedLot.status)}`}>
                    {selectedLot.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Items</p>
                  <p className="font-semibold">{selectedLot.total_items || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Value</p>
                  <p className="font-semibold">
                    ${Number(selectedLot.total_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {selectedLot.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm bg-muted p-3 rounded">{selectedLot.notes}</p>
                </div>
              )}

              {/* Items Table */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Items ({lotItems.length})</h3>
                
                {loadingItems ? (
                  <div className="text-center py-8">Loading items...</div>
                ) : lotItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No items found in this batch
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {item.brand_title || item.sku || 'Unknown'}
                              </div>
                              {item.subject && (
                                <div className="text-sm text-muted-foreground">
                                  {item.subject}
                                </div>
                              )}
                              {(item.card_number || item.psa_cert) && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {item.card_number ? `#${item.card_number}` : ''}
                                  {item.psa_cert ? ` PSA:${item.psa_cert}` : ''}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.category && (
                              <Badge variant="outline">{item.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.grade && (
                              <Badge variant="outline">{item.grade}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            {item.price && `$${Number(item.price).toFixed(2)}`}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {item.printed_at && (
                                <Badge variant="secondary" className="text-xs">Printed</Badge>
                              )}
                              {item.pushed_at && (
                                <Badge variant="secondary" className="text-xs">Pushed</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
