import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  quantity: number;
}

interface IssueStats {
  store_key: string;
  total_sold_items: number;
  missing_shopify_id: number;
  bad_sync_status: number;
  never_synced: number;
}

interface ReconcileResult {
  itemId: string;
  sku?: string;
  subject?: string;
  action: 'confirmed_sold' | 'quantity_corrected' | 'cleared_shopify_refs' | 'error';
  details: string;
  before: {
    quantity: number;
    sold_at: string | null;
    shopify_product_id: string | null;
  };
  after: {
    quantity: number;
    sold_at: string | null;
    shopify_sync_status: string;
  };
}

interface ReconcileResponse {
  success: boolean;
  dryRun: boolean;
  processed: number;
  confirmed_sold: number;
  quantity_corrected: number;
  cleared_refs: number;
  errors: number;
  results: ReconcileResult[];
}

export function ShopifySyncReconciliation() {
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [dryRun, setDryRun] = useState(true);
  const [reconcileResults, setReconcileResults] = useState<ReconcileResponse | null>(null);
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
        .select("id, store_key, shopify_location_gid, lot_number, subject, sold_at, sold_price, shopify_sync_status, last_shopify_synced_at, shopify_product_id, quantity")
        .not("sold_at", "is", null)
        .in("store_key", ["hawaii", "lasvegas"])
        .or("shopify_sync_status.is.null,shopify_sync_status.not.in.(success,synced),shopify_removed_at.is.null")
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

  // Reconcile with actual Shopify data
  const reconcileMutation = useMutation({
    mutationFn: async ({ storeKey, itemIds }: { storeKey: string; itemIds?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('shopify-reconcile-sold-items', {
        body: {
          store_key: storeKey,
          item_ids: itemIds,
          dry_run: dryRun,
          batch_size: 50
        }
      });
      if (error) throw error;
      return data as ReconcileResponse;
    },
    onSuccess: (data) => {
      setReconcileResults(data);
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-issues"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-sync-stats"] });
      
      if (data.dryRun) {
        toast.info(`Dry run complete: ${data.processed} items analyzed`, {
          description: `${data.confirmed_sold} confirmed sold, ${data.quantity_corrected} mismatches found`
        });
      } else {
        toast.success(`Reconciliation complete: ${data.processed} items processed`, {
          description: `${data.confirmed_sold} sold, ${data.quantity_corrected} corrected, ${data.errors} errors`
        });
      }
    },
    onError: (error: Error) => {
      toast.error(`Reconciliation failed: ${error.message}`);
    }
  });

  const totalIssues = stats?.reduce((sum, s) => sum + s.bad_sync_status, 0) || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Shopify Inventory Reconciliation
          </CardTitle>
          <CardDescription>
            Sync actual inventory state from Shopify - fixes quantities, sold status, and sync errors
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
                        onClick={() => reconcileMutation.mutate({ storeKey: stat.store_key })}
                        disabled={reconcileMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {dryRun ? "Preview" : "Reconcile"} {stat.bad_sync_status} Items
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
                Found {totalIssues} items with sync issues. Reconciliation will query Shopify for actual inventory levels and update the database to match.
              </AlertDescription>
            </Alert>
          )}

          {/* Dry Run Toggle */}
          <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
            <Switch
              id="dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
            <div className="flex-1">
              <Label htmlFor="dry-run" className="cursor-pointer font-medium">
                Dry Run Mode {dryRun ? "(Preview Only)" : "(Live Updates)"}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {dryRun 
                  ? "Preview changes without modifying database"
                  : "⚠️ Will update database to match Shopify inventory"
                }
              </p>
            </div>
          </div>

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

          {/* Reconciliation Results */}
          {reconcileResults && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {reconcileResults.dryRun ? "Preview Results" : "Reconciliation Results"}
                  {reconcileResults.dryRun && <Badge variant="outline">Dry Run</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold">{reconcileResults.processed}</div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg bg-green-50 dark:bg-green-950">
                    <div className="text-2xl font-bold text-green-600">{reconcileResults.confirmed_sold}</div>
                    <div className="text-xs text-muted-foreground">Confirmed Sold</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg bg-amber-50 dark:bg-amber-950">
                    <div className="text-2xl font-bold text-amber-600">{reconcileResults.quantity_corrected}</div>
                    <div className="text-xs text-muted-foreground">Corrected</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold">{reconcileResults.cleared_refs}</div>
                    <div className="text-xs text-muted-foreground">Cleared</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg bg-red-50 dark:bg-red-950">
                    <div className="text-2xl font-bold text-red-600">{reconcileResults.errors}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>

                {reconcileResults.results.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {reconcileResults.results.map((result, idx) => (
                      <div key={idx} className="p-3 border rounded-lg text-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-medium truncate">{result.subject || result.sku}</div>
                            <div className="text-xs text-muted-foreground">{result.details}</div>
                          </div>
                          <Badge 
                            variant={
                              result.action === 'quantity_corrected' ? 'default' : 
                              result.action === 'confirmed_sold' ? 'secondary' :
                              result.action === 'error' ? 'destructive' : 'outline'
                            }
                          >
                            {result.action === 'quantity_corrected' && <TrendingUp className="h-3 w-3 mr-1" />}
                            {result.action === 'confirmed_sold' && <CheckCircle className="h-3 w-3 mr-1" />}
                            {result.action.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        
                        {result.action === 'quantity_corrected' && (
                          <div className="flex gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Before: </span>
                              <span className="text-red-600 line-through">qty={result.before.quantity}, sold</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">After: </span>
                              <span className="text-green-600">qty={result.after.quantity}, active</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sold At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell className="font-mono text-sm">{issue.lot_number}</TableCell>
                      <TableCell className="max-w-xs truncate">{issue.subject}</TableCell>
                      <TableCell className="capitalize">{issue.store_key}</TableCell>
                      <TableCell>
                        <Badge variant={issue.quantity > 0 ? "default" : "secondary"}>
                          {issue.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{issue.shopify_sync_status || "null"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(issue.sold_at).toLocaleDateString()}
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
