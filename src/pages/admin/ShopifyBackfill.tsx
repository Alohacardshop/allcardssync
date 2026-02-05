import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Package, Filter, CheckCircle2, ChevronDown, HelpCircle, Eye } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

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
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Filter controls
  const [minQuantity, setMinQuantity] = useState(1);
  const [maxQuantity, setMaxQuantity] = useState(900);
  const [skipUntracked, setSkipUntracked] = useState(true);
  
  // Advanced options - hidden by default
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleImportClick = () => {
    setShowConfirm(true);
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-pull-products-by-tags', {
        body: {
          storeKey: 'hawaii',
          skipAlreadyPulled: false,
          status: 'active',
          maxPages: 100,
          dryRun: true,
          minQuantity,
          maxQuantity,
          skipUntracked
        }
      });

      if (error) throw error;
      setResult(data as BackfillResult);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Preview failed';
      setResult({ 
        success: false,
        error: errorMessage
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const runImport = async () => {
    setLoading(true);
    setResult(null);
    setShowConfirm(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-pull-products-by-tags', {
        body: {
          storeKey: 'hawaii',
          skipAlreadyPulled: false,
          status: 'active',
          maxPages: 100,
          dryRun: false,
          minQuantity,
          maxQuantity,
          skipUntracked
        }
      });

      if (error) throw error;
      setResult(data as BackfillResult);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Import failed';
      setResult({ 
        success: false,
        error: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <PageHeader
        title="Shopify Inventory Import"
        description="Pull all products from Hawaii Shopify store"
        showEcosystem
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        }
      />

      <div className="grid gap-6 mt-6">
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
          </CardContent>
        </Card>

        {/* Import Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Hawaii Store Import
            </CardTitle>
            <CardDescription>
              Pull inventory from aloha-card-shop.myshopify.com
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleImportClick} 
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin mr-2" />
                  Importing...
                </>
              ) : (
                'Run Import'
              )}
            </Button>

            {/* Diagnostics - Collapsible */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  Diagnostics
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="p-3 rounded-lg border bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">Preview Mode</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>For diagnostics only. Shows what would be imported without making changes.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={runPreview}
                      disabled={previewLoading || loading}
                    >
                      {previewLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

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

      <ConfirmActionDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={runImport}
        title="Confirm Shopify Import"
        description="This will import products from Shopify into your local inventory. Existing items with matching SKUs will be updated. This action cannot be undone."
        confirmLabel="Run Import"
        loading={loading}
      />
    </div>
  );
}
