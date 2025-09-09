import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Store, Trash2 } from "lucide-react";

interface ShopifyRemovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: 'auto' | 'graded' | 'raw') => void;
  items: Array<{
    id: string;
    sku?: string | null;
    shopify_product_id?: string | null;
    source_provider?: string | null;
    category?: string | null;
    brand_title?: string | null;
    psa_cert?: string | null;
    type?: string | null;
  }>;
  loading: boolean;
}

export function ShopifyRemovalDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  items, 
  loading 
}: ShopifyRemovalDialogProps) {
  const [mode, setMode] = useState<'auto' | 'graded' | 'raw'>('auto');

  // Check if items can be removed (have SKU or Shopify product ID)
  const removableItems = items.filter(item => 
    item.shopify_product_id || item.sku
  );

  // If no removable items, show explanatory message
  if (removableItems.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Shopify Removal
            </DialogTitle>
            <DialogDescription>
              This item cannot be removed from Shopify because it has no SKU or Shopify product ID to match.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const gradedCount = removableItems.filter(item => item.type === "Graded").length;
  const rawCount = removableItems.length - gradedCount;

  const handleConfirm = () => {
    onConfirm(mode);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Shopify Removal
          </DialogTitle>
          <DialogDescription>
            {removableItems.length} item{removableItems.length !== 1 ? 's' : ''} will be processed in Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Graded items:</span>
              <Badge variant="default">{gradedCount}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Raw items:</span>
              <Badge variant="secondary">{rawCount}</Badge>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 border rounded-lg bg-destructive/5 border-destructive/20">
              <Trash2 className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm space-y-1">
                <div className="font-medium text-destructive">Graded items</div>
                <div className="text-muted-foreground">
                  Will be <strong>deleted</strong> from Shopify completely
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 border rounded-lg bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-sm space-y-1">
                <div className="font-medium text-amber-700">Raw items</div>
                <div className="text-muted-foreground">
                  Will have inventory <strong>set to 0</strong> in Shopify (product kept)
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Removal mode:</label>
            <Select value={mode} onValueChange={(value: 'auto' | 'graded' | 'raw') => setMode(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (recommended)</SelectItem>
                <SelectItem value="graded">Force Graded (delete all)</SelectItem>
                <SelectItem value="raw">Force Raw (zero all)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Auto mode applies the correct action per item type
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm} 
            disabled={loading}
          >
            {loading ? "Processing..." : "Apply Shopify Removal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}