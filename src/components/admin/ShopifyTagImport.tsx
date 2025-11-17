import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StoreSelector } from "@/components/StoreSelector";
import { useStore } from "@/contexts/StoreContext";
import { RefreshCw, Download, Eye, Clock, Info } from "lucide-react";
import { logger } from '@/lib/logger';

export function ShopifyTagImport() {
  const { assignedStore } = useStore();
  const [gradedTags, setGradedTags] = useState("graded,PSA");
  const [rawTags, setRawTags] = useState("single");
  const [updatedSince, setUpdatedSince] = useState("");
  const [maxPages, setMaxPages] = useState("10");
  const [status, setStatus] = useState("active");
  const [fullScanPreview, setFullScanPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const parseTagString = (tagString: string): string[] => {
    return tagString.split(',').map(tag => tag.trim()).filter(Boolean);
  };

  const handlePreview = async () => {
    if (!assignedStore) {
      toast.error("Please select a store first");
      return;
    }

    setPreviewing(true);
    
    // Set up 60-second timeout for previews
    const timeoutId = setTimeout(() => {
      setPreviewing(false);
      toast.error("Preview timed out after 60 seconds. Try adding an 'Updated Since' filter or reducing scope.");
    }, 60000);

    try {
      const { data, error } = await supabase.functions.invoke("shopify-pull-products-by-tags", {
        body: {
          storeKey: assignedStore,
          gradedTags: parseTagString(gradedTags),
          rawTags: parseTagString(rawTags),
          updatedSince: updatedSince || undefined,
          maxPages: fullScanPreview ? parseInt(maxPages) || 50 : 3,
          status: status,
          dryRun: true
        }
      });

      clearTimeout(timeoutId);
      if (error) throw error;

      setLastResult(data);
      
      const stats = data.statistics;
      const isPartialResults = stats.pagesProcessed >= 3 && !fullScanPreview;
      toast.success(
        `Preview: Found ${stats.totalProducts} products (${stats.gradedProducts} graded, ${stats.rawProducts} raw) with ${stats.totalVariants} variants${isPartialResults ? ' (estimated from partial scan)' : ''}`
      );
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error('Preview error', error instanceof Error ? error : new Error(String(error)), undefined, 'shopify-tag-import');
      toast.error("Preview failed: " + (error.message || "Unknown error"));
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!assignedStore) {
      toast.error("Please select a store first");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-pull-products-by-tags", {
        body: {
          storeKey: assignedStore,
          gradedTags: parseTagString(gradedTags),
          rawTags: parseTagString(rawTags),
          updatedSince: updatedSince || undefined,
          maxPages: parseInt(maxPages) || 50,
          status: status,
          dryRun: false
        }
      });

      if (error) throw error;

      setLastResult(data);
      
      const stats = data.statistics;
      toast.success(
        `Import complete: ${stats.upsertedRows} items imported from ${stats.totalProducts} products`
      );
    } catch (error) {
      logger.error('Import error', error instanceof Error ? error : new Error(String(error)), undefined, 'shopify-tag-import');
      toast.error("Import failed: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import Products by Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Store</Label>
              <StoreSelector />
            </div>
            
            <div className="space-y-2">
              <Label>Product Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="any">Any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Max Pages (Import)</Label>
              <Input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Graded Tags (comma-separated)</Label>
            <Textarea
              value={gradedTags}
              onChange={(e) => setGradedTags(e.target.value)}
              placeholder="graded,Professional Sports Authenticator (PSA),PSA"
              className="h-20"
            />
            <p className="text-xs text-muted-foreground">
              Products with any of these tags will be imported as "graded" cards
            </p>
          </div>

          <div className="space-y-2">
            <Label>Raw Tags (comma-separated)</Label>
            <Textarea
              value={rawTags}
              onChange={(e) => setRawTags(e.target.value)}
              placeholder="single"
              className="h-20"
            />
            <p className="text-xs text-muted-foreground">
              Products with any of these tags will be imported as "raw" cards
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Updated Since (Optional)
              <Clock className="h-4 w-4 text-muted-foreground" />
            </Label>
            <Input
              type="datetime-local"
              value={updatedSince}
              onChange={(e) => setUpdatedSince(e.target.value)}
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Filtering by date significantly speeds up previews and imports
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="fullScanPreview"
              checked={fullScanPreview}
              onCheckedChange={(checked) => setFullScanPreview(checked === true)}
            />
            <Label htmlFor="fullScanPreview" className="text-sm">
              Full Scan Preview (slower, uses Max Pages setting)
            </Label>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handlePreview} 
              disabled={previewing || loading}
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewing ? "Previewing..." : "Preview"}
            </Button>
            
            <Button 
              onClick={handleImport} 
              disabled={loading || previewing}
            >
              <Download className="h-4 w-4 mr-2" />
              {loading ? "Importing..." : "Run Import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {lastResult.dryRun ? "Preview" : "Import"} Results
              {lastResult.dryRun && lastResult.statistics.pagesProcessed >= 3 && !fullScanPreview && (
                <Badge variant="outline" className="ml-2">Estimated Totals</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {lastResult.statistics.totalProducts} Products
                </Badge>
                <Badge variant="secondary">
                  {lastResult.statistics.gradedProducts} Graded
                </Badge>
                <Badge variant="secondary">
                  {lastResult.statistics.rawProducts} Raw
                </Badge>
                <Badge variant="secondary">
                  {lastResult.statistics.totalVariants} Variants
                </Badge>
                {!lastResult.dryRun && (
                  <Badge variant="default">
                    {lastResult.statistics.upsertedRows} Rows Upserted
                  </Badge>
                )}
              </div>

              {lastResult.statistics.errors && lastResult.statistics.errors.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-destructive">Errors:</Label>
                  <div className="bg-destructive/10 p-3 rounded text-sm">
                    {lastResult.statistics.errors.map((error: string, idx: number) => (
                      <div key={idx} className="text-destructive">{error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}