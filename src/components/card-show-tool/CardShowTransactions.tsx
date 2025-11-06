import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, Download } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

export function CardShowTransactions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<"txn_date" | "price" | "card_title">("txn_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["card-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_transactions")
        .select(`
          *,
          alt_items(id, title, grade, grading_service, set_name, image_url),
          shows(id, name)
        `)
        .order("txn_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return [];

    let filtered = transactions.filter((txn: any) => {
      // Search filter
      if (searchTerm) {
        const cardTitle = txn.alt_items?.title?.toLowerCase() || "";
        if (!cardTitle.includes(searchTerm.toLowerCase())) return false;
      }

      // Transaction type filter
      if (txnTypeFilter && txn.txn_type !== txnTypeFilter) return false;

      // Show filter
      if (showFilter && txn.show_id !== showFilter) return false;

      // Date range filters
      if (startDate) {
        const txnDate = new Date(txn.txn_date);
        const filterDate = new Date(startDate);
        if (txnDate < filterDate) return false;
      }
      if (endDate) {
        const txnDate = new Date(txn.txn_date);
        const filterDate = new Date(endDate);
        filterDate.setHours(23, 59, 59, 999); // End of day
        if (txnDate > filterDate) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a: any, b: any) => {
      let aVal, bVal;
      
      if (sortColumn === "txn_date") {
        aVal = new Date(a.txn_date).getTime();
        bVal = new Date(b.txn_date).getTime();
      } else if (sortColumn === "price") {
        aVal = parseFloat(a.price) || 0;
        bVal = parseFloat(b.price) || 0;
      } else if (sortColumn === "card_title") {
        aVal = a.alt_items?.title?.toLowerCase() || "";
        bVal = b.alt_items?.title?.toLowerCase() || "";
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [transactions, searchTerm, txnTypeFilter, showFilter, startDate, endDate, sortColumn, sortDirection]);

  const handleSort = (column: "txn_date" | "price" | "card_title") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (column: "txn_date" | "price" | "card_title") => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 inline" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1 inline" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1 inline" />
    );
  };

  const clearFilters = () => {
    setTxnTypeFilter("");
    setShowFilter("");
    setStartDate("");
    setEndDate("");
  };

  const hasActiveFilters = txnTypeFilter || showFilter || startDate || endDate;

  const handleExportCSV = () => {
    if (!filteredAndSortedTransactions || filteredAndSortedTransactions.length === 0) {
      toast.error("No transactions to export");
      return;
    }

    const headers = [
      "Date", "Type", "Card", "Grade", "Show", "Price", "Notes"
    ];
    const rows = filteredAndSortedTransactions.map((txn: any) => [
      new Date(txn.txn_date).toLocaleDateString(),
      txn.txn_type,
      txn.alt_items?.title || "",
      txn.alt_items?.grading_service && txn.alt_items?.grade 
        ? `${txn.alt_items.grading_service} ${txn.alt_items.grade}` 
        : "",
      txn.shows?.name || "",
      txn.price || "",
      txn.notes || ""
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("CSV exported successfully");
  };

  // Calculate profit/loss stats
  const stats = useMemo(() => {
    const filtered = filteredAndSortedTransactions;
    const totalBuy = filtered
      .filter((t: any) => t.txn_type === "BUY")
      .reduce((sum: number, t: any) => sum + (parseFloat(t.price) || 0), 0);
    const totalSell = filtered
      .filter((t: any) => t.txn_type === "SELL")
      .reduce((sum: number, t: any) => sum + (parseFloat(t.price) || 0), 0);
    
    return {
      totalBuy,
      totalSell,
      profit: totalSell - totalBuy,
      buyCount: filtered.filter((t: any) => t.txn_type === "BUY").length,
      sellCount: filtered.filter((t: any) => t.txn_type === "SELL").length,
    };
  }, [filteredAndSortedTransactions]);

  if (isLoading) {
    return <div className="text-center py-8">Loading transactions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Buy</div>
          <div className="text-2xl font-bold text-destructive">${stats.totalBuy.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">{stats.buyCount} transactions</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Sell</div>
          <div className="text-2xl font-bold text-success">${stats.totalSell.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">{stats.sellCount} transactions</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Net Profit/Loss</div>
          <div className={`text-2xl font-bold ${stats.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
            {stats.profit >= 0 ? '+' : ''}{stats.profit.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">
            {stats.profit >= 0 ? 'Profit' : 'Loss'}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4 items-center">
          <Input
            placeholder="Search by card title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
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
                    {[txnTypeFilter, showFilter, startDate, endDate].filter(Boolean).length}
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
            <div className="grid grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/50">
              <div>
                <Label className="text-sm mb-2 block">Transaction Type</Label>
                <Select value={txnTypeFilter} onValueChange={setTxnTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="BUY">Buy</SelectItem>
                    <SelectItem value="SELL">Sell</SelectItem>
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
                    <SelectItem value="">All</SelectItem>
                    {shows?.map((show) => (
                      <SelectItem key={show.id} value={show.id}>
                        {show.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-sm mb-2 block">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th 
                className="p-3 text-left cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("txn_date")}
              >
                Date {getSortIcon("txn_date")}
              </th>
              <th className="p-3 text-left">Type</th>
              <th 
                className="p-3 text-left cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("card_title")}
              >
                Card {getSortIcon("card_title")}
              </th>
              <th className="p-3 text-left">Grade</th>
              <th className="p-3 text-left">Show</th>
              <th 
                className="p-3 text-right cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("price")}
              >
                Price {getSortIcon("price")}
              </th>
              <th className="p-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTransactions.map((txn: any) => (
              <tr key={txn.id} className="border-t hover:bg-muted/50">
                <td className="p-3">
                  {new Date(txn.txn_date).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <Badge variant={txn.txn_type === "BUY" ? "destructive" : "default"}>
                    {txn.txn_type}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {txn.alt_items?.image_url && (
                      <img
                        src={txn.alt_items.image_url}
                        alt={txn.alt_items.title || "Card"}
                        className="w-8 h-8 object-cover rounded"
                      />
                    )}
                    <div>
                      {txn.alt_items?.title || "Unknown Card"}
                      {txn.alt_items?.set_name && (
                        <div className="text-xs text-muted-foreground">
                          {txn.alt_items.set_name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  {txn.alt_items?.grading_service && txn.alt_items?.grade ? (
                    <Badge variant="outline">
                      {txn.alt_items.grading_service} {txn.alt_items.grade}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="p-3">
                  {txn.shows?.name || "-"}
                </td>
                <td className="p-3 text-right font-semibold">
                  ${parseFloat(txn.price).toFixed(2)}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {txn.notes || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedTransactions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {hasActiveFilters 
            ? "No transactions match your filters. Try adjusting your search criteria."
            : "No transactions recorded yet. Add transactions from the Dashboard tab."}
        </div>
      )}
    </div>
  );
}
