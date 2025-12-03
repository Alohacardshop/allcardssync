import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  // Has active listing
  if (syncStatus === 'synced' && listingId) {
    return (
      <Badge 
        variant="default" 
        className="bg-blue-100 text-blue-800 border-blue-300 cursor-pointer hover:bg-blue-200"
        onClick={(e) => {
          e.stopPropagation();
          if (listingUrl) {
            window.open(listingUrl, '_blank');
          }
        }}
      >
        <CheckCircle className="h-3 w-3 mr-1" />
        eBay Live
        {listingUrl && <ExternalLink className="h-3 w-3 ml-1" />}
      </Badge>
    );
  }

  // Sync in progress
  if (syncStatus === 'pending' || syncStatus === 'processing') {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        eBay Syncing
      </Badge>
    );
  }

  // Queued for sync
  if (syncStatus === 'queued') {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
        <Clock className="h-3 w-3 mr-1" />
        eBay Queued
      </Badge>
    );
  }

  // Sync error
  if (syncStatus === 'error') {
    return (
      <Badge 
        variant="destructive" 
        className="cursor-help"
        title={syncError || 'Unknown error'}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        eBay Error
      </Badge>
    );
  }

  // Marked for eBay but not yet synced
  if (listOnEbay && !listingId) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
        <Clock className="h-3 w-3 mr-1" />
        eBay Pending
      </Badge>
    );
  }

  return null;
});

EbayStatusBadge.displayName = 'EbayStatusBadge';
