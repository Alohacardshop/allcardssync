import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShoppingBag, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { InventoryListItem } from '../../types';

interface EbaySectionProps {
  item: InventoryListItem;
  detailData?: unknown;
  onToggleEbay: () => void;
  isTogglingEbay?: boolean;
}

const getEbayStatus = (item: InventoryListItem) => {
  const status = item.ebay_sync_status;
  if (status === 'synced' && item.ebay_listing_id) return { label: 'Listed', variant: 'default' as const };
  if (status === 'queued' || status === 'processing') return { label: 'Queued', variant: 'outline' as const, loading: true };
  if (status === 'error') return { label: 'Error', variant: 'destructive' as const };
  if (item.list_on_ebay) return { label: 'Pending', variant: 'outline' as const };
  return { label: 'Not Listed', variant: 'secondary' as const };
};

export const EbaySection = React.memo(({ item, detailData, onToggleEbay, isTogglingEbay }: EbaySectionProps) => {
  const ebayStatus = getEbayStatus(item);
  const isListed = item.ebay_listing_id !== null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">eBay</h3>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Badge 
            variant={ebayStatus.variant}
            className={ebayStatus.loading ? 'animate-pulse' : ''}
          >
            {ebayStatus.loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {ebayStatus.label}
          </Badge>
        </div>
        
        {item.ebay_listing_url && (
          <a 
            href={item.ebay_listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View on eBay
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {item.ebay_listing_id && (
        <div>
          <span className="text-sm text-muted-foreground">Listing ID</span>
          <p className="font-mono text-xs text-muted-foreground">{item.ebay_listing_id}</p>
        </div>
      )}

      {item.ebay_sync_error && (
        <div className="p-2 bg-destructive/10 rounded-md">
          <span className="text-sm font-medium text-destructive">Error</span>
          <p className="text-xs text-destructive/80 mt-0.5">{item.ebay_sync_error}</p>
        </div>
      )}

      {item.ebay_price_check && (
        <div className="p-2 bg-muted/50 rounded-md">
          <span className="text-sm font-medium">Price Check</span>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>Avg: ${item.ebay_price_check.ebay_average?.toFixed(2)}</span>
            <span>Diff: {item.ebay_price_check.difference_percent?.toFixed(0)}%</span>
            <span>({item.ebay_price_check.price_count} listings)</span>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onToggleEbay}
        disabled={isTogglingEbay || item.deleted_at !== null || item.sold_at !== null}
        className="w-full"
      >
        {isTogglingEbay ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ShoppingBag className="h-4 w-4 mr-2" />
        )}
        {item.list_on_ebay ? 'Remove from eBay' : 'List on eBay'}
      </Button>
    </div>
  );
});

EbaySection.displayName = 'EbaySection';
