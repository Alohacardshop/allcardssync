import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
  const isListed = ebayStatus === 'synced' && ebayListingId;

  const handleToggle = () => {
    toggleListOnEbay(item.id, listOnEbay || false);
  };

  const getStatusBadge = () => {
    if (isListed) return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-blue-600 hover:bg-blue-700 text-white border-blue-600">Listed</Badge>;
    if (ebayStatus === 'error') return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Error</Badge>;
    if (ebayStatus === 'queued' || ebayStatus === 'processing') return <Badge variant="outline" className="text-[10px] h-5 px-1.5 animate-pulse">Syncing</Badge>;
    if (ebayStatus === 'pending') return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Pending</Badge>;
    if (listOnEbay) return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Queued</Badge>;
    return null;
  };

  return (
    <div className="space-y-2">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium shrink-0">eBay</span>
          {getStatusBadge()}
        </div>
        <Switch
          checked={listOnEbay || false}
          onCheckedChange={handleToggle}
          disabled={isToggling === item.id || item.deleted_at !== null}
          className="border border-border shrink-0"
        />
      </div>

      {/* Compact error line */}
      {ebayError && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-destructive cursor-help">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <p className="text-xs truncate">{ebayError}</p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[300px] text-xs">
            {ebayError}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Listing details */}
      {isListed && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono truncate mr-2">{ebayListingId}</span>
          {ebayListingUrl && (
            <a
              href={ebayListingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
});

EbayTab.displayName = 'EbayTab';
