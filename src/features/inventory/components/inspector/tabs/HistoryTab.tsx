import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { InventoryListItem } from '../../../types';

interface HistoryTabProps {
  item: InventoryListItem;
  detailData?: {
    intake_lots?: { lot_number: string; status: string | null } | null;
    pushed_at?: string | null;
  } | null;
}

export const HistoryTab = React.memo(({ item, detailData }: HistoryTabProps) => {
  const lot = detailData?.intake_lots;
  const pushedAt = detailData?.pushed_at;
  
  const handleCopyId = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success('ID copied');
  };

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Timeline
        </h4>
        
        <div className="space-y-2">
          {/* Created */}
          <div className="flex items-center justify-between p-2 border-l-2 border-primary/50 pl-3">
            <div>
              <span className="text-sm font-medium">Created</span>
              <p className="text-xs text-muted-foreground">
                Internal record created
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs">
                {format(new Date(item.created_at), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Pushed to Shopify */}
          {pushedAt && (
            <div className="flex items-center justify-between p-2 border-l-2 border-primary/50 pl-3">
              <div>
                <span className="text-sm font-medium">Pushed to Shopify</span>
                <p className="text-xs text-muted-foreground">
                  Sent to Shopify store
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs">
                  {format(new Date(pushedAt), 'MMM d, yyyy')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(pushedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          )}

          {/* Last Updated */}
          <div className="flex items-center justify-between p-2 border-l-2 border-muted-foreground/30 pl-3">
            <div>
              <span className="text-sm font-medium">Last Updated</span>
              <p className="text-xs text-muted-foreground">
                Most recent modification
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs">
                {format(new Date(item.updated_at), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Sold */}
          {item.sold_at && (
            <div className="flex items-center justify-between p-2 border-l-2 border-secondary pl-3 bg-secondary/5">
              <div>
                <span className="text-sm font-medium">Sold</span>
              </div>
              <div className="text-right">
                <p className="text-xs">
                  {format(new Date(item.sold_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}

          {/* Deleted */}
          {item.deleted_at && (
            <div className="flex items-center justify-between p-2 border-l-2 border-destructive pl-3 bg-destructive/5">
              <div>
                <span className="text-sm font-medium text-destructive">Deleted</span>
                <p className="text-xs text-muted-foreground">
                  Removed from inventory
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs">
                  {format(new Date(item.deleted_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lot Info */}
      {lot && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Intake Lot
          </h4>
          
          <div className="p-3 bg-muted/30 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Lot Number</span>
              <span className="font-mono text-xs">{lot.lot_number}</span>
            </div>
            {lot.status && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {lot.status}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Internal IDs */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Internal IDs
        </h4>
        
        <div className="p-3 bg-muted/30 rounded-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Item ID</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs truncate max-w-[140px]">{item.id.slice(0, 8)}...</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5"
                onClick={() => handleCopyId(item.id)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">SKU</span>
            <span className="font-mono text-xs">{item.sku || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

HistoryTab.displayName = 'HistoryTab';
