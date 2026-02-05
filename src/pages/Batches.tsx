import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { Search, Package, DollarSign, Calendar, Eye, Trash2, XCircle, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { logger } from "@/lib/logger";
import { PageHeader } from "@/components/layout/PageHeader";

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
  deleted_at?: string;
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
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedLot, setSelectedLot] = useState<IntakeLot | null>(null);
  const [lotItems, setLotItems] = useState<IntakeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [closingBatch, setClosingBatch] = useState<string | null>(null);
  const [showDeletedItems, setShowDeletedItems] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const { toast } = useToast();
  const { assignedStore, selectedLocation } = useStore();

  // Clear selection when filter changes to prevent hidden-selection bugs
  useEffect(() => {
    setSelectedBatches(new Set());
  }, [statusFilter]);

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
            .maybeSingle();
          
          setIsAdmin(!!data && !error);
        }
      } catch (error) {
        logger.error('Error checking admin status', error as Error);
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
      if (assignedStore) {
        query = query.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setLots(data || []);
    } catch (error) {
      logger.error('Error fetching lots', error as Error, { assignedStore, selectedLocation });
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
      let query = supabase
        .from('intake_items')
        .select('*')
        .eq('lot_id', lotId);
      
      // Filter out deleted items by default
      if (!showDeletedItems) {
        query = query.is('deleted_at', null);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setLotItems(data || []);
    } catch (error) {
      logger.error('Error fetching lot items', error as Error, { lotId });
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
  }, [assignedStore, selectedLocation]); // Re-fetch when store/location changes

  // Re-fetch lot items when showDeletedItems changes
  useEffect(() => {
    if (selectedLot) {
      fetchLotItems(selectedLot.id);
    }
  }, [showDeletedItems]);

  const handleCloseBatch = async (lotId: string, lotNumber: string) => {
    setClosingBatch(lotId);
    try {
      const { error } = await supabase.rpc('close_empty_batch', {
        lot_id_in: lotId
      });

      if (error) throw error;

      toast({
        title: "Batch Closed",
        description: `Batch ${lotNumber} has been closed`,
      });

      await fetchLots();
      
      if (selectedLot?.id === lotId) {
        setSelectedLot(null);
      }
    } catch (error) {
      logger.error('Error closing batch', error as Error, { lotId, lotNumber });
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close batch",
        variant: "destructive",
      });
    } finally {
      setClosingBatch(null);
    }
  };

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
      description: `Batch ${lotNumber} deleted`,
      });

      // Refresh the lots list
      await fetchLots();
      
    // Clear from selection if it was selected
    setSelectedBatches(prev => {
      const newSet = new Set(prev);
      newSet.delete(lotId);
      return newSet;
    });
    
      // Close the modal if it was open
      if (selectedLot?.id === lotId) {
        setSelectedLot(null);
      }

    } catch (error) {
      logger.error('Error deleting batch', error as Error, { lotId, lotNumber });
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete batch",
        variant: "destructive",
      });
    } finally {
      setDeletingBatch(null);
    }
  };

  const toggleBatchSelection = (lotId: string) => {
    setSelectedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lotId)) {
        newSet.delete(lotId);
      } else {
        newSet.add(lotId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedBatches.size === filteredLots.length) {
      setSelectedBatches(new Set());
    } else {
      setSelectedBatches(new Set(filteredLots.map(lot => lot.id)));
    }
  };

  const handleBulkClose = async () => {
    const emptyBatches = filteredLots.filter(
      lot => selectedBatches.has(lot.id) && lot.status === 'active' && (lot.total_items === 0)
    );
    
    if (emptyBatches.length === 0) {
      toast({
        title: "No eligible batches",
        description: "Only empty active batches can be closed",
        variant: "destructive",
      });
      return;
    }

    setBulkActionLoading(true);
    try {
      for (const lot of emptyBatches) {
        await supabase.rpc('close_empty_batch', { lot_id_in: lot.id });
      }
      
      toast({
        title: "Batches Closed",
        description: `${emptyBatches.length} empty batches have been closed`,
      });
      
      setSelectedBatches(new Set());
      await fetchLots();
    } catch (error) {
      logger.error('Error bulk closing batches', error as Error);
      toast({
        title: "Error",
        description: "Failed to close some batches",
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!isAdmin) return;
    
    const batchesToDelete = filteredLots.filter(
      lot => selectedBatches.has(lot.id) && lot.status !== 'deleted'
    );
    
    setBulkActionLoading(true);
    try {
    let successCount = 0;
      for (const lot of batchesToDelete) {
      try {
        await supabase.rpc('admin_delete_batch', {
          lot_id_in: lot.id,
          reason_in: `Bulk deleted via admin interface`
        });
        successCount++;
      } catch {
        // Continue with remaining batches
      }
      }
      
    if (successCount === 0) {
      throw new Error('No batches were deleted');
    }
    
      toast({
        title: "Batches Deleted",
      description: successCount === batchesToDelete.length 
        ? `${successCount} batches deleted. View in "Deleted" filter.`
        : `${successCount} of ${batchesToDelete.length} batches deleted.`,
      });
      
      setSelectedBatches(new Set());
      await fetchLots();
    } catch (error) {
      logger.error('Error bulk deleting batches', error as Error);
      toast({
        title: "Error",
        description: "Failed to delete some batches",
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const getStaleInfo = (lot: IntakeLot) => {
    if (lot.status !== 'active') return null;
    
    const daysOld = differenceInDays(new Date(), new Date(lot.created_at));
    const isEmpty = lot.total_items === 0;
    
    if (isEmpty) {
      return { type: 'empty', label: 'Stale - 0 items' };
    }
    if (daysOld > 7) {
      return { type: 'old', label: `Stale - ${daysOld} days` };
    }
    return null;
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
      case 'closed': return 'bg-blue-500';
      case 'deleted': return 'bg-red-500';
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
    <div className="space-y-6">
      <PageHeader
          title="Batches"
          description="View and manage intake batches and their items"
          showEcosystem
        />
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
            <option value="closed">Closed</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedBatches.size > 0 && (
          <Card className="mb-6 border-primary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedBatches.size} batch{selectedBatches.size > 1 ? 'es' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkClose}
                    disabled={bulkActionLoading}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Close Empty
                  </Button>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={bulkActionLoading}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Selected
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected Batches</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedBatches.size} batches? 
                            This will soft-delete all items in these batches. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleBulkDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Batches
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedBatches(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedBatches.size === filteredLots.length && filteredLots.length > 0}
                        indeterminate={selectedBatches.size > 0 && selectedBatches.size < filteredLots.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
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
                  {filteredLots.map((lot) => {
                    const staleInfo = getStaleInfo(lot);
                    return (
                    <TableRow key={lot.id} className={staleInfo ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedBatches.has(lot.id)}
                          onCheckedChange={() => toggleBatchSelection(lot.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono">{lot.lot_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {lot.lot_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className={`text-white ${getStatusColor(lot.status)}`}
                          >
                            {lot.status}
                          </Badge>
                          {staleInfo && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {staleInfo.label}
                            </Badge>
                          )}
                        </div>
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
                          {lot.status === 'active' && lot.total_items === 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCloseBatch(lot.id, lot.lot_number)}
                              disabled={closingBatch === lot.id}
                              title="Close empty batch"
                            >
                              <XCircle className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
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
                  )})}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Items ({lotItems.length})</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={showDeletedItems}
                      onCheckedChange={(checked) => setShowDeletedItems(checked === true)}
                    />
                    Show deleted items
                  </label>
                </div>
                
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
