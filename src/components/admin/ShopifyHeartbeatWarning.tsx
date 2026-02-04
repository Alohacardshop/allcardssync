import React from 'react';
import { AlertTriangle, Clock, Wifi, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useShopifyHeartbeat, type StoreHeartbeatSummary } from '@/hooks/useShopifyHeartbeat';
import { formatDistanceToNow } from 'date-fns';

interface ShopifyHeartbeatWarningProps {
  /** Show compact inline version instead of full alert */
  compact?: boolean;
}

export function ShopifyHeartbeatWarning({ compact = false }: ShopifyHeartbeatWarningProps) {
  const { data: heartbeatSummaries, isLoading } = useShopifyHeartbeat();

  if (isLoading || !heartbeatSummaries) {
    return null;
  }

  const staleStores = heartbeatSummaries.filter(s => s.has_stale_locations);

  if (staleStores.length === 0) {
    if (compact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
                <Wifi className="h-3 w-3" />
                Live
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>All Shopify locations are receiving updates</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  }

  if (compact) {
    const totalStaleLocations = staleStores.reduce(
      (sum, s) => sum + s.locations.filter(l => l.is_stale).length,
      0
    );

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-orange-600 border-orange-600 gap-1 cursor-help">
              <WifiOff className="h-3 w-3" />
              {totalStaleLocations} stale
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-medium mb-1">Shopify activity stale</p>
            <p className="text-xs text-muted-foreground">
              {totalStaleLocations} location(s) haven't received updates in over 60 minutes.
              This may indicate webhook delivery issues.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Alert variant="default" className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-800 dark:text-orange-400">
        Shopify activity stale
      </AlertTitle>
      <AlertDescription className="text-orange-700 dark:text-orange-300">
        <p className="mb-2">
          No Shopify updates received in over 60 minutes for the following locations:
        </p>
        <ul className="space-y-1 text-sm">
          {staleStores.map(store => (
            <li key={store.store_key}>
              <span className="font-medium">{store.store_key}:</span>{' '}
              {store.locations
                .filter(l => l.is_stale)
                .map(l => (
                  <span key={l.location_gid || 'global'} className="inline-flex items-center gap-1 mr-2">
                    {l.location_name || l.location_gid?.split('/').pop() || 'Global'}
                    <span className="text-xs text-muted-foreground">
                      ({l.minutes_since_last}m ago)
                    </span>
                  </span>
                ))}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs">
          This is visibility only and does not block inventory operations. 
          Check Shopify webhook configuration if this persists.
        </p>
      </AlertDescription>
    </Alert>
  );
}

interface HeartbeatStatusBadgeProps {
  storeKey: string;
  locationGid?: string | null;
}

export function HeartbeatStatusBadge({ storeKey, locationGid }: HeartbeatStatusBadgeProps) {
  const { data: heartbeatSummaries } = useShopifyHeartbeat();

  const storeSummary = heartbeatSummaries?.find(s => s.store_key === storeKey);
  
  if (!storeSummary) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <Clock className="h-3 w-3" />
              No data
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>No webhook activity recorded for this store</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // If locationGid provided, check that specific location
  if (locationGid) {
    const locationStatus = storeSummary.locations.find(l => l.location_gid === locationGid);
    
    if (!locationStatus) {
      return null;
    }

    if (locationStatus.is_stale) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-orange-600 border-orange-600 gap-1">
                <WifiOff className="h-3 w-3" />
                Stale
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Last activity: {locationStatus.last_received_at 
                ? formatDistanceToNow(new Date(locationStatus.last_received_at), { addSuffix: true })
                : 'Never'}</p>
              <p className="text-xs text-muted-foreground">Topic: {locationStatus.last_topic}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
              <Wifi className="h-3 w-3" />
              Active
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Last activity: {locationStatus.last_received_at 
              ? formatDistanceToNow(new Date(locationStatus.last_received_at), { addSuffix: true })
              : 'Never'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Store-level summary
  if (storeSummary.has_stale_locations) {
    const staleCount = storeSummary.locations.filter(l => l.is_stale).length;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-orange-600 border-orange-600 gap-1">
              <WifiOff className="h-3 w-3" />
              {staleCount} stale
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{staleCount} location(s) with no updates in &gt;60 min</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
            <Wifi className="h-3 w-3" />
            Active
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>All locations receiving updates</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
