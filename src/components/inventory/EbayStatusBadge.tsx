import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface EbayStatusBadgeProps {
  syncStatus?: string | null;
  listingId?: string | null;
  listingUrl?: string | null;
  syncError?: string | null;
  listOnEbay?: boolean | null;
}

export const EbayStatusBadge = React.memo(({
  syncStatus,
  listingId,
  listingUrl,
  syncError,
  listOnEbay
}: EbayStatusBadgeProps) => {
  // Not marked for eBay
  if (!listOnEbay) {
    return null;
  }

  // Has active listing - blue "synced" style matching Shopify badge
  if (syncStatus === 'synced' && listingId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="default" 
            className="text-[10px] h-5 px-1.5 font-medium whitespace-nowrap cursor-pointer bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              if (listingUrl) {
                window.open(listingUrl, '_blank');
              }
            }}
          >
            Listed
            {listingUrl && <ExternalLink className="h-2.5 w-2.5 ml-1" />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Live on eBay{listingUrl ? ' — click to view' : ''}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Sync in progress
  if (syncStatus === 'pending' || syncStatus === 'processing') {
    return (
      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium whitespace-nowrap animate-pulse">
        <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
        Syncing
      </Badge>
    );
  }

  // Queued for sync
  if (syncStatus === 'queued') {
    return (
      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium whitespace-nowrap">
        <Clock className="h-2.5 w-2.5 mr-1" />
        Queued
      </Badge>
    );
  }

  // Sync error - red
  if (syncStatus === 'error') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="destructive" 
            className="text-[10px] h-5 px-1.5 font-medium whitespace-nowrap cursor-help"
          >
            <AlertCircle className="h-2.5 w-2.5 mr-1" />
            Error
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="text-xs max-w-[300px] z-50">
          {syncError || 'Unknown sync error'}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Marked for eBay but not yet synced - outline pending
  if (listOnEbay && !listingId) {
    return (
      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium whitespace-nowrap">
        <Clock className="h-2.5 w-2.5 mr-1" />
        Pending
      </Badge>
    );
  }

  return null;
});

EbayStatusBadge.displayName = 'EbayStatusBadge';
