import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StoreSelector } from "@/components/StoreSelector";
import { useStore } from "@/contexts/StoreContext";
import { RefreshCw, Download, Eye } from "lucide-react";

export function ShopifyTagImport() {
  const { selectedStore } = useStore();
  const [gradedTags, setGradedTags] = useState("graded,Professional Sports Authenticator (PSA),PSA");
  const [rawTags, setRawTags] = useState("single");
  const [updatedSince, setUpdatedSince] = useState("");
  const [maxPages, setMaxPages] = useState("50");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const parseTagString = (tagString: string): string[] => {
    return tagString.split(',').map(tag => tag.trim()).filter(Boolean);
  };

  const handlePreview = async () => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-pull-products-by-tags", {
        body: {
          storeKey: selectedStore,
          gradedTags: parseTagString(gradedTags),
          rawTags: parseTagString(rawTags),
          updatedSince: updatedSince || undefined,
          maxPages: parseInt(maxPages) || 50,
          dryRun: true
        }
      });

      if (error) throw error;

      setLastResult(data);
      
      const stats = data.statistics;
      toast.success(
        `Preview: Found ${stats.totalProducts} products (${stats.gradedProducts} graded, ${stats.rawProducts} raw) with ${stats.totalVariants} variants`
      );
    } catch (error) {
      console.error('Preview error:', error);
      toast.error("Preview failed: " + (error.message || "Unknown error"));
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-pull-products-by-tags", {
        body: {
          storeKey: selectedStore,
          gradedTags: parseTagString(gradedTags),
          rawTags: parseTagString(rawTags),
          updatedSince: updatedSince || undefined,
          maxPages: parseInt(maxPages) || 50,
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
      console.error('Import error:', error);
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Store</Label>
              <StoreSelector />
            </div>
            
            <div className="space-y-2">
              <Label>Max Pages</Label>
              <Input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                placeholder="50"
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
            <Label>Updated Since (Optional)</Label>
            <Input
              type="datetime-local"
              value={updatedSince}
              onChange={(e) => setUpdatedSince(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Only import products updated after this date/time
            </p>
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