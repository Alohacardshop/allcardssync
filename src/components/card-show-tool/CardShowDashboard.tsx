import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, Edit, Plus, Filter, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { CardShowTransactionDialog } from "./CardShowTransactionDialog";
import { CardShowEditDialog } from "./CardShowEditDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

export function CardShowDashboard() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [gradingServiceFilter, setGradingServiceFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
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
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("alt_items")
        .delete()
        .eq("id", itemId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
      setDeleteDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete card");
    },
  });

  const sendToInventoryMutation = useMutation({
    mutationFn: async (item: any) => {
      // Map alt_items fields to intake_items fields
      const intakeData = {
        brand_title: item.set_name || item.title,
        subject: item.title,
        year: item.year,
        card_number: item.alt_uuid, // Using cert number as card number
        grade: item.grade,
        grading_company: item.grading_service || 'PSA',
        type: 'Graded',
        price: item.alt_value,
        image_urls: item.image_url ? [item.image_url] : null,
        psa_cert: item.grading_service === 'PSA' ? item.alt_uuid : null,
        cgc_cert: item.grading_service === 'CGC' ? item.alt_uuid : null,
        processing_notes: `Imported from ALT on ${new Date().toLocaleDateString()}`,
      };

      const { error } = await supabase
        .from("intake_items")
        .insert(intakeData);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card sent to inventory successfully!");
      queryClient.invalidateQueries({ queryKey: ["intake-items"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send to inventory");
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
    setSelectedItem(item);
    setDeleteDialogOpen(true);
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
              <th className="p-3 text-left">Image</th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Grade</th>
              <th className="p-3 text-right">ALT Value</th>
              <th className="p-3 text-right">Latest Buy</th>
              <th className="p-3 text-right">Latest Sell</th>
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
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.title || "Card"}
                        className="w-12 h-12 object-cover rounded"
                      />
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
                  <td className="p-3 text-right">
                    {latestBuy ? `$${latestBuy.price}` : "-"}
                  </td>
                  <td className="p-3 text-right">
                    {latestSell ? `$${latestSell.price}` : "-"}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <Button 
                        size="sm" 
                        variant="default" 
                        onClick={() => sendToInventoryMutation.mutate(item)}
                        disabled={sendToInventoryMutation.isPending}
                        title="Send to Inventory"
                      >
                        <PackagePlus className="h-4 w-4 mr-1" />
                        To Inventory
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => openTransactionDialog(item)}
                        title="Add Transaction"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => openEditDialog(item)}
                        title="Edit Values"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => handleRefreshFromAlt(item)}
                        disabled={refreshFromAltMutation.isPending || !item.alt_uuid}
                        title="Refresh from ALT"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => openDeleteDialog(item)}
                        title="Delete Card"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <AlertDialogTitle>Delete Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedItem?.title}"? 
              This will permanently remove the card and all associated transactions. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && deleteCardMutation.mutate(selectedItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCardMutation.isPending ? "Deleting..." : "Delete Card"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
