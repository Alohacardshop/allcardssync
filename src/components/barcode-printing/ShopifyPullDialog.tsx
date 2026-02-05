import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronDown, HelpCircle } from "lucide-react";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

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
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Form state - default to LIVE mode (not dry run)
  const [includeGraded, setIncludeGraded] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [gradedTags, setGradedTags] = useState("graded, PSA");
  const [rawTags, setRawTags] = useState("single");
  const [status, setStatus] = useState("active");
  const [timeframe, setTimeframe] = useState("all");
  const [customDate, setCustomDate] = useState("");
  
  // Advanced options - hidden by default
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);

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

  const handlePullClick = () => {
    if (!includeGraded && !includeRaw) {
      toast({
        title: "Selection Required",
        description: "Please select at least graded or raw products to pull",
        variant: "destructive"
      });
      return;
    }

    // If preview mode, execute directly
    if (previewOnly) {
      executePull();
      return;
    }

    // For live actions, show confirmation
    setShowConfirm(true);
  };

  const executePull = async () => {
    setLoading(true);
    setShowConfirm(false);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error("Not authenticated");
      }

      const payload: Record<string, unknown> = {
        storeKey,
        status,
        dryRun: previewOnly
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
        title: previewOnly ? "Preview Complete" : "Products Pulled Successfully",
        description: `${stats.totalProducts || 0} products processed (${stats.gradedProducts || 0} graded, ${stats.rawProducts || 0} raw). ${previewOnly ? 'No changes made (preview mode).' : `${stats.upsertedRows || 0} items synced.`}`
      });

      if (!previewOnly) {
        onSuccess?.();
      }
      
      onOpenChange(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to pull products from Shopify";
      console.error("Pull error:", error);
      toast({
        title: "Pull Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pull Products from Shopify</DialogTitle>
            <DialogDescription>
              Import products matching your criteria into local inventory
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

            {/* Advanced Options - Collapsible */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  Advanced Options
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="flex items-center space-x-2 p-3 rounded-lg border bg-muted/50">
                  <Checkbox
                    id="previewOnly"
                    checked={previewOnly}
                    onCheckedChange={(checked) => setPreviewOnly(checked as boolean)}
                  />
                  <Label htmlFor="previewOnly" className="font-normal cursor-pointer flex items-center gap-1">
                    Preview (no changes)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>For diagnostics only. Shows what would be imported without saving to the database.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handlePullClick} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {previewOnly ? "Preview" : "Pull Products"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={executePull}
        title="Pull Products from Shopify"
        description="This will import products from Shopify into your local inventory. Existing items with matching SKUs will be updated."
        confirmLabel="Pull Products"
        loading={loading}
      />
    </>
  );
}
