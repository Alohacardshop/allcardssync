import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEbayListing } from '@/hooks/useEbayListing';
import type { InventoryListItem } from '../../../types';

interface EbayTabProps {
  item: InventoryListItem;
}

export const EbayTab = React.memo(({ item }: EbayTabProps) => {
  const { toggleListOnEbay, isToggling } = useEbayListing();
  
  const ebayListingId = item.ebay_listing_id;
  const ebayListingUrl = item.ebay_listing_url;
  const ebayStatus = item.ebay_sync_status;
  const ebayError = item.ebay_sync_error;
  const listOnEbay = item.list_on_ebay;

  const handleToggle = () => {
    toggleListOnEbay(item.id, listOnEbay || false);
  };

  const getStatusBadge = () => {
    if (!ebayStatus) return null;
    
    switch (ebayStatus) {
      case 'synced':
        return <Badge variant="default">Listed</Badge>;
      case 'queued':
      case 'processing':
        return <Badge variant="outline" className="animate-pulse">Processing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{ebayStatus}</Badge>;
    }
  };

  const isListed = ebayStatus === 'synced' && ebayListingId;

  return (
    <div className="space-y-4">
      {/* Toggle for listing */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
        <div className="space-y-0.5">
          <Label htmlFor="list-on-ebay" className="text-sm font-medium">
            List on eBay
          </Label>
          <p className="text-xs text-muted-foreground">
            {listOnEbay ? 'Will sync to eBay' : 'Not listed on eBay'}
          </p>
        </div>
        <Switch
          id="list-on-ebay"
          checked={listOnEbay || false}
          onCheckedChange={handleToggle}
          disabled={isToggling === item.id || item.deleted_at !== null}
        />
      </div>

      {/* Status info */}
      {ebayStatus && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status:</span>
          {getStatusBadge()}
        </div>
      )}

      {/* Listing details */}
      {isListed && (
        <div className="space-y-3 p-3 bg-muted/30 rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Listing ID</span>
            <span className="font-mono text-xs">{ebayListingId}</span>
          </div>
          
          {ebayListingUrl && (
            <a
              href={ebayListingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full p-2 text-sm text-primary hover:underline border border-border rounded-md"
            >
              View on eBay
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}


      {/* Error */}
      {ebayError && (
        <div className="p-2 bg-destructive/10 rounded-md flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <span className="text-sm font-medium text-destructive">Sync Error</span>
            <p className="text-xs text-destructive/80 mt-0.5">{ebayError}</p>
          </div>
        </div>
      )}

      {/* Not enabled */}
      {!listOnEbay && !ebayStatus && (
        <div className="p-4 bg-muted/50 rounded-md text-center">
          <p className="text-sm text-muted-foreground">Not enabled for eBay</p>
          <p className="text-xs text-muted-foreground mt-1">
            Toggle the switch above to list this item
          </p>
        </div>
      )}
    </div>
  );
});

EbayTab.displayName = 'EbayTab';
