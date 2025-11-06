import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, Edit, Plus } from "lucide-react";
import { toast } from "sonner";

export function CardShowDashboard() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["alt-items", searchTerm],
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

      const { data, error } = await query;
      if (error) throw error;
      return data;
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

  const handleExportCSV = () => {
    if (!items || items.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Title", "Grade", "Grading Service", "Set", "Year", "ALT Value", "Latest Buy", "Latest Sell"];
    const rows = items.map(item => {
      const latestBuy = getLatestTransaction(item.card_transactions, "BUY");
      const latestSell = getLatestTransaction(item.card_transactions, "SELL");
      
      return [
        item.title || "",
        item.grade || "",
        item.grading_service || "",
        item.set_name || "",
        item.year || "",
        item.alt_value || "",
        latestBuy?.price || "",
        latestSell?.price || ""
      ];
    });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-show-export-${new Date().toISOString()}.csv`;
    a.click();
    toast.success("CSV exported successfully");
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading items...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Input
          placeholder="Search by title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
        <Button onClick={() => refetch()} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
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
              <th className="p-3 text-right">Actions</th>
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
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="icon" variant="ghost">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <RefreshCw className="h-4 w-4" />
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
          No items found. Add items from ALT to get started.
        </div>
      )}
    </div>
  );
}
