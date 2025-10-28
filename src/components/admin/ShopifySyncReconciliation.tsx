import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SyncIssue {
  id: string;
  store_key: string;
  shopify_location_gid: string;
  lot_number: string;
  subject: string;
  sold_at: string;
  sold_price: number | null;
  shopify_sync_status: string | null;
  last_shopify_synced_at: string | null;
  shopify_product_id: string | null;
}

interface IssueStats {
  store_key: string;
  total_sold_items: number;
  missing_shopify_id: number;
  bad_sync_status: number;
  never_synced: number;
}

export function ShopifySyncReconciliation() {
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const queryClient = useQueryClient();

  // Fetch issue statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["shopify-sync-stats"],
    queryFn: async () => {
      // Fetch all sold items and calculate stats client-side
      const { data, error } = await supabase
        .from("intake_items")
        .select("id, store_key, shopify_product_id, shopify_sync_status, last_shopify_synced_at")
        .not("sold_at", "is", null)
        .in("store_key", ["hawaii", "lasvegas"]);
      
      if (error) throw error;
      
      const statsMap = new Map<string, IssueStats>();
      data?.forEach(item => {
        if (!statsMap.has(item.store_key)) {
          statsMap.set(item.store_key, {
            store_key: item.store_key,
            total_sold_items: 0,
            missing_shopify_id: 0,
            bad_sync_status: 0,
            never_synced: 0
          });
        }
        const stat = statsMap.get(item.store_key)!;
        stat.total_sold_items++;
        if (!item.shopify_product_id) stat.missing_shopify_id++;
        if (!item.shopify_sync_status || !["success", "synced"].includes(item.shopify_sync_status)) {
          stat.bad_sync_status++;
        }
        if (!item.last_shopify_synced_at) stat.never_synced++;
      });
      
      return Array.from(statsMap.values());
    }
  });

  // Fetch items with sync issues
  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ["shopify-sync-issues", selectedStore],
    queryFn: async () => {
      let query = supabase
        .from("intake_items")
        .select("id, store_key, shopify_location_gid, lot_number, subject, sold_at, sold_price, shopify_sync_status, last_shopify_synced_at, shopify_product_id")
        .not("sold_at", "is", null)
        .in("store_key", ["hawaii", "lasvegas"])
        .or("shopify_sync_status.is.null,shopify_sync_status.not.in.(success,synced),shopify_product_id.is.null")
        .order("sold_at", { ascending: false })
        .limit(100);

      if (selectedStore !== "all") {
        query = query.eq("store_key", selectedStore);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SyncIssue[];
    }
  });

  // Fix single item
  const fixItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("intake_items")
        .update({
          shopify_sync_status: "synced",
          shopify_product_id: null,
          shopify_variant_id: null,
          shopify_inventory_item_id: null,
          shopify_removed_at: new Date().toISOString()
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-issues"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-stats"] });
      toast.success("Item reconciled successfully");
    },
    onError: (error) => {
      toast.error(`Failed to reconcile: ${error.message}`);
    }
  });

  // Fix all items for a store
  const fixAllMutation = useMutation({
    mutationFn: async (storeKey: string) => {
      const { error } = await supabase
        .from("intake_items")
        .update({
          shopify_sync_status: "synced",
          shopify_removed_at: new Date().toISOString()
        })
        .eq("store_key", storeKey)
        .not("sold_at", "is", null)
        .or("shopify_sync_status.is.null,shopify_sync_status.not.in.(success,synced)");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-issues"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-stats"] });
      toast.success("All items reconciled");
    },
    onError: (error) => {
      toast.error(`Failed to reconcile: ${error.message}`);
    }
  });

  const totalIssues = stats?.reduce((sum, s) => sum + s.bad_sync_status, 0) || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            Shopify Sync Reconciliation
          </CardTitle>
          <CardDescription>
            Find and fix items that didn't sync properly when sold in Shopify
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Statistics */}
          {statsLoading ? (
            <div>Loading statistics...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stats?.map((stat) => (
                <Card key={stat.store_key}>
                  <CardHeader>
                    <CardTitle className="text-base capitalize">{stat.store_key}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Sold:</span>
                      <span className="font-medium">{stat.total_sold_items}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Sync Issues:</span>
                      <Badge variant={stat.bad_sync_status > 0 ? "destructive" : "default"}>
                        {stat.bad_sync_status}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Missing IDs:</span>
                      <span className="text-sm">{stat.missing_shopify_id}</span>
                    </div>
                    {stat.bad_sync_status > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => fixAllMutation.mutate(stat.store_key)}
                        disabled={fixAllMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Fix All {stat.bad_sync_status} Items
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {totalIssues > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Found {totalIssues} items stuck in "removal_pending" status after being sold in Shopify. 
                These items need reconciliation to mark them as properly synced.
              </AlertDescription>
            </Alert>
          )}

          {/* Filter */}
          <div className="flex gap-2">
            <Button
              variant={selectedStore === "all" ? "default" : "outline"}
              onClick={() => setSelectedStore("all")}
              size="sm"
            >
              All Stores
            </Button>
            <Button
              variant={selectedStore === "hawaii" ? "default" : "outline"}
              onClick={() => setSelectedStore("hawaii")}
              size="sm"
            >
              Hawaii
            </Button>
            <Button
              variant={selectedStore === "lasvegas" ? "default" : "outline"}
              onClick={() => setSelectedStore("lasvegas")}
              size="sm"
            >
              Las Vegas
            </Button>
          </div>

          {/* Issues Table */}
          {issuesLoading ? (
            <div>Loading issues...</div>
          ) : issues && issues.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot #</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sold At</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell className="font-mono text-sm">{issue.lot_number}</TableCell>
                      <TableCell className="max-w-xs truncate">{issue.subject}</TableCell>
                      <TableCell className="capitalize">{issue.store_key}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{issue.shopify_sync_status || "null"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(issue.sold_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => fixItemMutation.mutate(issue.id)}
                          disabled={fixItemMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription>
                No sync issues found! All sold items are properly synced.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
