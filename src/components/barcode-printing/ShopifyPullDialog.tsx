import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ShopifyPullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeKey: string;
  locationGid: string;
  onSuccess?: () => void;
}

export function ShopifyPullDialog({
  open,
  onOpenChange,
  storeKey,
  locationGid,
  onSuccess
}: ShopifyPullDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [includeGraded, setIncludeGraded] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [gradedTags, setGradedTags] = useState("graded, PSA");
  const [rawTags, setRawTags] = useState("single");
  const [status, setStatus] = useState("active");
  const [timeframe, setTimeframe] = useState("all");
  const [customDate, setCustomDate] = useState("");
  const [dryRun, setDryRun] = useState(false);

  // Calculate updatedSince based on timeframe
  const getUpdatedSince = () => {
    if (timeframe === "custom") return customDate;
    if (timeframe === "all") return "";
    
    const now = new Date();
    const hours = {
      "24h": 24,
      "7d": 24 * 7,
      "30d": 24 * 30
    }[timeframe] || 0;
    
    if (hours > 0) {
      now.setHours(now.getHours() - hours);
      return now.toISOString();
    }
    return "";
  };

  const handlePull = async () => {
    if (!includeGraded && !includeRaw) {
      toast({
        title: "Selection Required",
        description: "Please select at least graded or raw products to pull",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error("Not authenticated");
      }

      const payload: any = {
        storeKey,
        status,
        dryRun
      };

      // Only include tags for selected categories
      if (includeGraded) {
        payload.gradedTags = gradedTags.split(",").map(t => t.trim()).filter(Boolean);
      } else {
        payload.gradedTags = [];
      }

      if (includeRaw) {
        payload.rawTags = rawTags.split(",").map(t => t.trim()).filter(Boolean);
      } else {
        payload.rawTags = [];
      }

      const updatedSince = getUpdatedSince();
      if (updatedSince) {
        payload.updatedSince = updatedSince;
      }

      const { data, error } = await supabase.functions.invoke('shopify-pull-products-by-tags', {
        body: payload,
        headers: {
          Authorization: `Bearer ${session.session.access_token}`
        }
      });

      if (error) throw error;

      const stats = data?.statistics || {};
      
      toast({
        title: dryRun ? "Preview Complete" : "Products Pulled Successfully",
        description: `${stats.totalProducts || 0} products processed (${stats.gradedProducts || 0} graded, ${stats.rawProducts || 0} raw). ${dryRun ? 'No changes made (preview mode).' : `${stats.upsertedRows || 0} items synced.`}`
      });

      if (!dryRun) {
        onSuccess?.();
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Pull error:", error);
      toast({
        title: "Pull Failed",
        description: error.message || "Failed to pull products from Shopify",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pull Products from Shopify</DialogTitle>
          <DialogDescription>
            Configure which products to pull for your location
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Types */}
          <div className="space-y-3">
            <Label>Product Types</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="graded"
                checked={includeGraded}
                onCheckedChange={(checked) => setIncludeGraded(checked as boolean)}
              />
              <Label htmlFor="graded" className="font-normal cursor-pointer">
                Graded Cards
              </Label>
            </div>
            
            {includeGraded && (
              <Input
                placeholder="Tags (comma separated)"
                value={gradedTags}
                onChange={(e) => setGradedTags(e.target.value)}
                className="ml-6"
              />
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="raw"
                checked={includeRaw}
                onCheckedChange={(checked) => setIncludeRaw(checked as boolean)}
              />
              <Label htmlFor="raw" className="font-normal cursor-pointer">
                Raw Cards
              </Label>
            </div>
            
            {includeRaw && (
              <Input
                placeholder="Tags (comma separated)"
                value={rawTags}
                onChange={(e) => setRawTags(e.target.value)}
                className="ml-6"
              />
            )}
          </div>

          {/* Product Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Product Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="any">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe */}
          <div className="space-y-2">
            <Label>Timeframe</Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Date</SelectItem>
              </SelectContent>
            </Select>
            {timeframe === "custom" && (
              <Input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Dry Run */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dryRun"
              checked={dryRun}
              onCheckedChange={(checked) => setDryRun(checked as boolean)}
            />
            <Label htmlFor="dryRun" className="font-normal cursor-pointer">
              Preview only (don't save to database)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handlePull} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dryRun ? "Preview" : "Pull Products"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
