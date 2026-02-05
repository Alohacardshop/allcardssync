import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, QrCode, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { InventoryListItem } from '../../../types';

interface PrintingTabProps {
  item: InventoryListItem;
  onPrint: () => void;
}

export const PrintingTab = React.memo(({ item, onPrint }: PrintingTabProps) => {
  const printedAt = item.printed_at;
  const barcode = item.psa_cert || item.cgc_cert || item.sku;

  return (
    <div className="space-y-4">
      {/* Print Status */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Label Status:</span>
        {printedAt ? (
          <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
            Printed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No Label
          </Badge>
        )}
      </div>

      {/* Print History */}
      {printedAt && (
        <div className="p-3 bg-muted/30 rounded-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Last Printed</span>
            <span className="text-xs">
              {formatDistanceToNow(new Date(printedAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Date</span>
            <span className="text-xs">
              {format(new Date(printedAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        </div>
      )}

      {/* Barcode Info */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Barcode Data
        </h4>
        
        <div className="p-3 bg-muted/30 rounded-md">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-sm truncate">{barcode || 'No barcode'}</span>
          </div>
        </div>
      </div>

      {/* SKU for label */}
      <div className="p-3 bg-muted/30 rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">SKU</span>
          <span className="font-mono text-xs">{item.sku || '—'}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">Price</span>
          <span className="text-xs font-medium">${(item.price || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Print Button */}
      <Button
        onClick={onPrint}
        disabled={item.deleted_at !== null}
        className="w-full"
      >
        <Printer className="h-4 w-4 mr-2" />
        Print Label
      </Button>

      {/* Note */}
      <p className="text-xs text-muted-foreground text-center">
        Opens the print dialog to create a label for this item
      </p>
    </div>
  );
});

PrintingTab.displayName = 'PrintingTab';
