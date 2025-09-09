import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Store, Trash2 } from "lucide-react";

interface ShopifyRemovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: 'delete') => void;
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
              <Trash2 className="h-5 w-5" />
              Delete from Shopify
            </DialogTitle>
            <DialogDescription>
              Can't resolve Shopify item—no SKU or product ID.
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
    onConfirm('delete'); // Always use delete mode now
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete from Shopify
          </DialogTitle>
          <DialogDescription>
            {removableItems.length} item{removableItems.length !== 1 ? 's' : ''} will be deleted from Shopify.
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
                <div className="font-medium text-destructive">All items</div>
                <div className="text-muted-foreground">
                  Will be <strong>deleted</strong> from Shopify. If product has multiple variants, only this variant is deleted.
                </div>
              </div>
            </div>
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
            {loading ? "Deleting..." : "Delete from Shopify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}