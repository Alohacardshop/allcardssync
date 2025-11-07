import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, Edit, Plus, Filter, Trash2, PackagePlus, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { CardShowTransactionDialog } from "./CardShowTransactionDialog";
import { CardShowEditDialog } from "./CardShowEditDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EditablePriceCell } from "./EditablePriceCell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function CardShowDashboard() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [gradingServiceFilter, setGradingServiceFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: shows } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, name")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["alt-items", searchTerm, gradingServiceFilter, gradeFilter, showFilter],
    queryFn: async () => {
      let query = supabase
        .from("alt_items")
        .select(`
          *,
          card_transactions(
            id,
            txn_type,
            price,
            txn_date,
            show_id,
            shows(name)
          )
        `)
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (searchTerm) {
        query = query.ilike("title", `%${searchTerm}%`);
      }

      if (gradingServiceFilter && gradingServiceFilter !== "all") {
        query = query.eq("grading_service", gradingServiceFilter);
      }

      if (gradeFilter && gradeFilter !== "all") {
        query = query.eq("grade", gradeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Client-side filter for show (since it's in transactions)
      if (showFilter && showFilter !== "all" && data) {
        return data.filter(item => 
          item.card_transactions?.some((txn: any) => txn.show_id === showFilter)
        );
      }

      return data;
    },
  });

  const refreshFromAltMutation = useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await supabase.functions.invoke("card-show-fetch-alt", {
        body: {
          certNumber: item.alt_uuid,
          defaults: undefined,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Card refreshed from ALT");
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to refresh from ALT");
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      console.log('🗑️ Deleting items:', itemIds);
      const { error } = await supabase
        .from("alt_items")
        .delete()
        .in("id", itemIds);
      
      if (error) {
        console.error('❌ Delete error:', error);
        throw error;
      }
      console.log('✅ Delete successful');
    },
    onSuccess: () => {
      console.log('✅ Delete mutation success, invalidating queries');
      toast.success(`${selectedItems.length} item(s) deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
      setDeleteDialogOpen(false);
      setSelectedItem(null);
      setSelectedItems([]);
    },
    onError: (error: any) => {
      console.error('❌ Delete mutation error:', error);
      toast.error(error.message || "Failed to delete card(s)");
    },
  });

  const sendToShowInventoryMutation = useMutation({
    mutationFn: async (item: any) => {
      const { error } = await supabase
        .from("alt_items")
        .update({ status: 'in_show_inventory' })
        .eq('id', item.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card moved to show inventory");
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to move to show inventory");
    },
  });

  const getGradeBadgeVariant = (grade: string | null) => {
    if (!grade) return "secondary";
    const numGrade = parseFloat(grade);
    if (numGrade >= 9.5) return "default"; // green
    if (numGrade >= 9) return "secondary"; // amber
    return "destructive"; // red
  };

  const getLatestTransaction = (transactions: any[], type: "BUY" | "SELL") => {
    const filtered = transactions?.filter((t: any) => t.txn_type === type) || [];
    return filtered.sort((a: any, b: any) => 
      new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime()
    )[0];
  };

  const clearFilters = () => {
    setGradingServiceFilter("all");
    setGradeFilter("all");
    setShowFilter("all");
  };

  const hasActiveFilters = (gradingServiceFilter && gradingServiceFilter !== "all") || (gradeFilter && gradeFilter !== "all") || (showFilter && showFilter !== "all");

  const handleExportCSV = () => {
    if (!items || items.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Title", "Grade", "Grading Service", "Set", "Year", "Population",
      "ALT Value", "ALT Checked", "Latest Buy", "Latest Sell", "Cert Number"
    ];
    const rows = items.map(item => {
      const latestBuy = getLatestTransaction(item.card_transactions, "BUY");
      const latestSell = getLatestTransaction(item.card_transactions, "SELL");
      
      return [
        item.title || "",
        item.grade || "",
        item.grading_service || "",
        item.set_name || "",
        item.year || "",
        item.population || "",
        item.alt_value || "",
        item.alt_checked_at ? new Date(item.alt_checked_at).toLocaleDateString() : "",
        latestBuy?.price || "",
        latestSell?.price || "",
        item.alt_uuid || ""
      ];
    });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-show-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("CSV exported successfully");
  };

  const openTransactionDialog = (item: any) => {
    setSelectedItem(item);
    setTransactionDialogOpen(true);
  };

  const openEditDialog = (item: any) => {
    setSelectedItem(item);
    setEditDialogOpen(true);
  };

  const handleRefreshFromAlt = (item: any) => {
    if (!item.alt_uuid) {
      toast.error("No certificate number found");
      return;
    }
    refreshFromAltMutation.mutate(item);
  };

  const openDeleteDialog = (item: any) => {
    console.log('🗑️ Opening delete dialog for item:', item.id, item.title);
    setSelectedItem(item);
    setSelectedItems([item.id]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    setDeleteDialogOpen(true);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === items?.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items?.map((item: any) => item.id) || []);
    }
  };

  const getItemsToDelete = () => {
    return items?.filter((item: any) => selectedItems.includes(item.id)) || [];
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading items...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex gap-4 items-center">
          <Input
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <Button onClick={() => refetch()} variant="outline" size="icon" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {selectedItems.length > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedItems.length} item(s) selected
            </span>
            <Button 
              onClick={handleBulkDelete}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
            <Button 
              onClick={() => setSelectedItems([])}
              variant="ghost"
              size="sm"
            >
              Clear Selection
            </Button>
          </div>
        )}

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {[gradingServiceFilter, gradeFilter, showFilter].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
          
          <CollapsibleContent className="mt-4">
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/50">
              <div>
                <Label className="text-sm mb-2 block">Grading Service</Label>
                <Select value={gradingServiceFilter} onValueChange={setGradingServiceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="PSA">PSA</SelectItem>
                    <SelectItem value="BGS">BGS</SelectItem>
                    <SelectItem value="CGC">CGC</SelectItem>
                    <SelectItem value="SGC">SGC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Grade</Label>
                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="9.5">9.5</SelectItem>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="8.5">8.5</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="7.5">7.5</SelectItem>
                    <SelectItem value="7">7</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Show</Label>
                <Select value={showFilter} onValueChange={setShowFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {shows?.map((show) => (
                      <SelectItem key={show.id} value={show.id}>
                        {show.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">
                <input
                  type="checkbox"
                  checked={items?.length > 0 && selectedItems.length === items?.length}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </th>
              <th className="p-3 text-left">Image</th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Grade</th>
              <th className="p-3 text-right">ALT Value</th>
              <th className="p-3 text-right">Buy</th>
              <th className="p-3 text-right">Sell</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item: any) => {
              const latestBuy = getLatestTransaction(item.card_transactions, "BUY");
              const latestSell = getLatestTransaction(item.card_transactions, "SELL");

              return (
                <tr key={item.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={() => toggleItemSelection(item.id)}
                      className="cursor-pointer"
                    />
                  </td>
                   <td className="p-3">
                     {item.image_url ? (
                       <img
                         src={item.image_url}
                         alt={item.title || "Card"}
                         className="w-20 h-28 object-contain rounded border"
                       />
                     ) : (
                       <div className="w-20 h-28 flex items-center justify-center bg-muted rounded border text-xs text-muted-foreground">
                         No Image
                       </div>
                     )}
                   </td>
                  <td className="p-3">
                    <a
                      href={item.alt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {item.title}
                    </a>
                    <div className="text-sm text-muted-foreground">
                      {item.set_name} {item.year && `(${item.year})`}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={getGradeBadgeVariant(item.grade)}>
                      {item.grading_service} {item.grade}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {item.alt_value ? `$${item.alt_value}` : "-"}
                    {item.alt_checked_at && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(item.alt_checked_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right w-32">
                    <EditablePriceCell
                      itemId={item.id}
                      currentPrice={latestBuy?.price || null}
                      transactionType="BUY"
                      transactionId={latestBuy?.id}
                    />
                  </td>
                  <td className="p-3 text-right w-32">
                    <EditablePriceCell
                      itemId={item.id}
                      currentPrice={latestSell?.price || null}
                      transactionType="SELL"
                      transactionId={latestSell?.id}
                    />
                  </td>
                  <td className="p-3 min-w-[240px] relative z-10 pointer-events-auto">
                    <div className="flex gap-2 justify-end items-center flex-nowrap isolate pointer-events-auto">
                      <Button 
                        size="sm" 
                        variant="default" 
                        onClick={(e) => {
                          e.stopPropagation();
                          sendToShowInventoryMutation.mutate(item);
                        }}
                        disabled={sendToShowInventoryMutation.isPending}
                        title="Send to Show Inventory"
                        className="flex-shrink-0"
                      >
                        <PackagePlus className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditDialog(item);
                        }}
                        title="Edit item"
                        aria-label="Edit item"
                        className="hover:bg-accent flex-shrink-0 pointer-events-auto"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          console.log('🖱️ Delete button clicked for item:', item.id);
                          e.preventDefault();
                          e.stopPropagation();
                          openDeleteDialog(item);
                        }}
                        disabled={deleteCardMutation.isPending}
                        title="Delete item"
                        aria-label={`Delete ${item.title ?? 'item'}`}
                        data-testid={`delete-${item.id}`}
                        className="hover:opacity-80 flex-shrink-0 pointer-events-auto relative z-20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline"
                            className="hover:bg-accent flex-shrink-0 pointer-events-auto"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            aria-label="More actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg">
                          <DropdownMenuItem onClick={() => openTransactionDialog(item)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Transaction
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleRefreshFromAlt(item)}
                            disabled={refreshFromAltMutation.isPending || !item.alt_uuid}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh from ALT
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {hasActiveFilters 
            ? "No items match your filters. Try adjusting your search criteria."
            : "No items found. Add items from ALT to get started."}
        </div>
      )}

      {selectedItem && (
        <>
          <CardShowTransactionDialog
            item={selectedItem}
            open={transactionDialogOpen}
            onOpenChange={setTransactionDialogOpen}
          />
          <CardShowEditDialog
            item={selectedItem}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The following item{selectedItems.length !== 1 ? 's' : ''} will be permanently deleted:
              {selectedItems.length <= 3 && (
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {getItemsToDelete().map((item: any) => (
                    <li key={item.id} className="text-sm">{item.title}</li>
                  ))}
                </ul>
              )}
              {selectedItems.length > 3 && (
                <p className="mt-2 font-medium">{selectedItems.length} items will be deleted</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                console.log('✅ Confirm delete clicked, deleting items:', selectedItems);
                e.preventDefault();
                deleteCardMutation.mutate(selectedItems);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCardMutation.isPending}
              aria-label="Confirm delete"
              data-testid="confirm-delete-button"
            >
              {deleteCardMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
