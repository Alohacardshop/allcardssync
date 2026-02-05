import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { History, FileText, MapPin } from 'lucide-react';
import { QuantityChangeHistory } from '@/components/QuantityChangeHistory';
import type { InventoryListItem } from '@/features/inventory/types';

interface ItemAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryListItem | null;
}

/**
 * Staff-facing dialog that answers "Why did this change?"
 * Shows clear, human-readable audit trail for inventory changes.
 */
export function ItemAuditDialog({ open, onOpenChange, item }: ItemAuditDialogProps) {
  if (!item) return null;

  // Generate display title
  const title = [
    item.year,
    item.brand_title,
    item.subject,
    item.card_number ? `#${item.card_number}` : null,
    item.grade && (item.psa_cert || item.cgc_cert) 
      ? `${item.grading_company || 'PSA'} ${item.grade}` 
      : null,
  ].filter(Boolean).join(' ') || item.sku || 'Unknown Item';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Why did this change?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item Summary */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate" title={title}>{title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs font-mono">
                  {item.sku || 'No SKU'}
                </Badge>
                {item.shopify_location_gid && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {item.shopify_location_gid.split('/').pop()}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Qty: <strong>{item.quantity}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <QuantityChangeHistory itemId={item.id} sku={item.sku || undefined} />

          {/* Help Text */}
          <div className="text-xs text-muted-foreground text-center py-2 border-t">
            This log shows all tracked changes to this item. 
            Changes include sales, transfers, reconciliation, and manual edits.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}