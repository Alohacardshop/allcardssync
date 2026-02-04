import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Package, Filter, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

interface PreviewItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
}

interface BackfillResult {
  success: boolean;
  message?: string;
  dryRun?: boolean;
  previewItems?: PreviewItem[];
  statistics?: {
    totalProducts: number;
    gradedProducts: number;
    rawProducts: number;
    totalVariants: number;
    skippedVariants: number;
    skippedBreakdown?: {
      noSku: number;
      untracked: number;
      lowQuantity: number;
      highQuantity: number;
    };
    upsertedRows: number;
    pagesProcessed: number;
    filters?: {
      minQuantity: number;
      maxQuantity: number;
      skipUntracked: boolean;
    };
    errors?: string[];
  };
  error?: string;
}

export default function ShopifyBackfill() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  
  // Filter controls
  const [minQuantity, setMinQuantity] = useState(1);
  const [maxQuantity, setMaxQuantity] = useState(900);
  const [skipUntracked, setSkipUntracked] = useState(true);
  const [dryRun, setDryRun] = useState(true);

  const runBackfill = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-pull-products-by-tags', {
        body: {
          storeKey: 'hawaii',
          skipAlreadyPulled: false,
          status: 'active',
          maxPages: 100,
          dryRun,
          minQuantity,
          maxQuantity,
          skipUntracked
        }
      });

      if (error) throw error;
      setResult(data as BackfillResult);
    } catch (error: any) {
      setResult({ 
        success: false,
        error: error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <PageHeader
        title="Shopify Inventory Backfill"
        description="Pull all products from Hawaii Shopify store with valid SKUs"
        showEcosystem
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        }
      />
      
      <Alert className="mb-6 mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This will pull products from Shopify that match your filter criteria.
          Use <strong>Preview Mode</strong> first to see what would be imported.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6">
        {/* Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Settings
            </CardTitle>
            <CardDescription>
              Configure which products to import based on inventory quantity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="minQty">Minimum Quantity</Label>
                <Input
                  id="minQty"
                  type="number"
                  min={0}
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  Skip items with quantity below this (0 = include out of stock)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="maxQty">Maximum Quantity</Label>
                <Input
                  id="maxQty"
                  type="number"
                  min={1}
                  value={maxQuantity}
                  onChange={(e) => setMaxQuantity(parseInt(e.target.value) || 900)}
                />
                <p className="text-xs text-muted-foreground">
                  Skip items with quantity above this (avoids bulk items)
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="skipUntracked">Skip Untracked Items</Label>
                <p className="text-xs text-muted-foreground">
                  Skip items not managed by Shopify inventory system
                </p>
              </div>
              <Switch
                id="skipUntracked"
                checked={skipUntracked}
                onCheckedChange={setSkipUntracked}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="dryRun" className="font-semibold">Preview Mode (Dry Run)</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, shows what would be imported without making changes
                </p>
              </div>
              <Switch
                id="dryRun"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
            </div>
          </CardContent>
        </Card>

        {/* Run Backfill */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Hawaii Store Backfill
            </CardTitle>
            <CardDescription>
              Pull inventory from aloha-card-shop.myshopify.com
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runBackfill} 
              disabled={loading}
              className="w-full"
              size="lg"
              variant={dryRun ? "outline" : "default"}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin mr-2" />
                  {dryRun ? 'Previewing...' : 'Importing...'}
                </>
              ) : (
                dryRun ? 'Preview Import' : 'Run Import'
              )}
            </Button>
            
            {!dryRun && (
              <p className="text-sm text-destructive text-center">
                ⚠️ This will insert/update records in the database
              </p>
            )}

            {/* Results */}
            {result && (
              <div className={`mt-4 p-4 rounded-lg ${result.success ? 'bg-muted' : 'bg-destructive/10'}`}>
                {result.success ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-semibold">
                        {result.dryRun ? 'Preview Complete' : 'Import Started'}
                      </span>
                    </div>
                    
                    {result.statistics && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Products Scanned</p>
                            <p className="text-xl font-bold">{result.statistics.totalProducts}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Variants</p>
                            <p className="text-xl font-bold">{result.statistics.totalVariants}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              {result.dryRun ? 'Would Import' : 'Imported'}
                            </p>
                            <p className="text-xl font-bold text-primary">{result.statistics.upsertedRows}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Skipped</p>
                            <p className="text-xl font-bold text-muted-foreground">{result.statistics.skippedVariants}</p>
                          </div>
                        </div>

                        {result.statistics.skippedBreakdown && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-medium mb-2">Skip Breakdown:</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-background p-2 rounded">
                                <span className="text-muted-foreground">No SKU:</span>{' '}
                                <span className="font-medium">{result.statistics.skippedBreakdown.noSku}</span>
                              </div>
                              <div className="bg-background p-2 rounded">
                                <span className="text-muted-foreground">Untracked:</span>{' '}
                                <span className="font-medium">{result.statistics.skippedBreakdown.untracked}</span>
                              </div>
                              <div className="bg-background p-2 rounded">
                                <span className="text-muted-foreground">Low Qty (&lt;{minQuantity}):</span>{' '}
                                <span className="font-medium">{result.statistics.skippedBreakdown.lowQuantity}</span>
                              </div>
                              <div className="bg-background p-2 rounded">
                                <span className="text-muted-foreground">High Qty (&gt;{maxQuantity}):</span>{' '}
                                <span className="font-medium">{result.statistics.skippedBreakdown.highQuantity}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {result.statistics.errors && result.statistics.errors.length > 0 && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-medium text-destructive mb-2">
                              Errors ({result.statistics.errors.length}):
                            </p>
                            <div className="text-xs space-y-1 max-h-32 overflow-auto">
                              {result.statistics.errors.map((err, i) => (
                                <p key={i} className="text-destructive">{err}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                                    {/* Preview Items Table */}
                                    {result.dryRun && result.previewItems && result.previewItems.length > 0 && (
                                      <div className="border-t pt-4">
                                        <p className="text-sm font-medium mb-2">
                                          Sample Items ({result.previewItems.length} of {result.statistics?.upsertedRows || 0}):
                                        </p>
                                        <div className="max-h-64 overflow-auto border rounded">
                                          <Table>
                                            <TableHeader>
                                              <TableRow className="bg-muted">
                                                <TableHead className="text-xs py-2">SKU</TableHead>
                                                <TableHead className="text-xs py-2">Title</TableHead>
                                                <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                                                <TableHead className="text-xs py-2 text-right">Price</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {result.previewItems.map((item, i) => (
                                                <TableRow key={i}>
                                                  <TableCell className="text-xs py-1 font-mono">{item.sku}</TableCell>
                                                  <TableCell className="text-xs py-1 truncate max-w-[200px]">{item.title}</TableCell>
                                                  <TableCell className="text-xs py-1 text-right">{item.quantity}</TableCell>
                                                  <TableCell className="text-xs py-1 text-right">${item.price.toFixed(2)}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                        {(result.statistics?.upsertedRows || 0) > 50 && (
                                          <p className="text-xs text-muted-foreground mt-2">
                                            Showing first 50 items. {(result.statistics?.upsertedRows || 0) - 50} more items would also be imported.
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {result.message && (
                                      <p className="text-sm text-muted-foreground">{result.message}</p>
                                    )}
                  </div>
                ) : (
                  <div className="text-destructive">
                    <p className="font-semibold">Error</p>
                    <p className="text-sm">{result.error}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
