import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryListItem } from '../../types';

interface MetadataSectionProps {
  item: InventoryListItem;
  detailData?: {
    intake_lots?: {
      lot_number: string;
      status: string | null;
    } | null;
  } | null;
}

export const MetadataSection = React.memo(({ item, detailData }: MetadataSectionProps) => {
  const handleCopyId = () => {
    navigator.clipboard.writeText(item.id);
    toast.success('ID copied');
  };

  // Extract Shopify created_at from snapshot if available
  const shopifyCreatedAt = item.shopify_snapshot?.created_at as string | undefined;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Metadata</h3>
      
      {/* Timestamps - clearly distinguish internal vs Shopify */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-muted-foreground block">Internal Created</span>
          <p className="text-sm">
            {format(new Date(item.created_at), 'MMM d, yyyy')}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </p>
        </div>
        
        <div>
          <span className="text-xs text-muted-foreground block">Entered Shopify</span>
          {shopifyCreatedAt ? (
            <>
              <p className="text-sm">
                {format(new Date(shopifyCreatedAt), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(shopifyCreatedAt), { addSuffix: true })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">Not synced</p>
          )}
        </div>
      </div>

      <div>
        <span className="text-xs text-muted-foreground block">Last Updated</span>
        <p className="text-sm">
          {format(new Date(item.updated_at), 'MMM d, yyyy h:mm a')}
        </p>
      </div>

      <div>
        <span className="text-xs text-muted-foreground block">Internal ID</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              onClick={handleCopyId}
              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="truncate max-w-[200px]">{item.id}</span>
              <Copy className="h-3 w-3 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Click to copy</TooltipContent>
        </Tooltip>
      </div>

      {detailData?.intake_lots?.lot_number && (
        <div>
          <span className="text-xs text-muted-foreground block">Lot Number</span>
          <p className="text-sm font-mono">{detailData.intake_lots.lot_number}</p>
        </div>
      )}

      {item.store_key && (
        <div>
          <span className="text-xs text-muted-foreground block">Store</span>
          <p className="text-sm">{item.store_key}</p>
        </div>
      )}
    </div>
  );
});

MetadataSection.displayName = 'MetadataSection';
