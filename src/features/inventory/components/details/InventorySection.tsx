import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { getLocationNickname } from '@/lib/locationNicknames';
import type { InventoryListItem } from '../../types';
import type { CachedLocation } from '@/hooks/useLocationNames';

interface InventorySectionProps {
  item: InventoryListItem;
  locationsMap?: Map<string, CachedLocation>;
  detailData?: {
    cost?: number | null;
    vendor?: string | null;
  } | null;
}

export const InventorySection = React.memo(({ item, locationsMap, detailData }: InventorySectionProps) => {
  const locationName = item.shopify_location_gid 
    ? locationsMap?.get(item.shopify_location_gid)?.location_name || 'Unknown'
    : 'No location';
  const nickname = getLocationNickname(locationName);
  
  // Use cost from list item first, then fall back to detail data
  const cost = item.cost ?? detailData?.cost;
  const vendor = detailData?.vendor ?? item.vendor;
  
  const getStatus = () => {
    if (item.deleted_at) return { label: 'Deleted', variant: 'destructive' as const };
    if (item.sold_at) return { label: 'Sold', variant: 'secondary' as const };
    if (item.quantity === 0) return { label: 'Out of Stock', variant: 'outline' as const };
    return { label: 'Active', variant: 'default' as const };
  };
  
  const status = getStatus();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Inventory</h3>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-xs text-muted-foreground block">Quantity</span>
          <p className="text-lg font-semibold tabular-nums">{item.quantity}</p>
        </div>
        
        <div>
          <span className="text-xs text-muted-foreground block">Price</span>
          <p className="text-lg font-semibold tabular-nums">${(item.price || 0).toFixed(2)}</p>
        </div>
        
        <div>
          <span className="text-xs text-muted-foreground block">Cost</span>
          <p className="text-lg font-semibold tabular-nums">
            {cost != null ? `$${cost.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-muted-foreground block">Location</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm cursor-default">{nickname}</p>
            </TooltipTrigger>
            {nickname !== locationName && (
              <TooltipContent side="bottom">{locationName}</TooltipContent>
            )}
          </Tooltip>
        </div>
        
        <div>
          <span className="text-xs text-muted-foreground block">Status</span>
          <div className="mt-0.5">
            <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-muted-foreground block">Label</span>
          <div className="mt-0.5">
            {item.printed_at ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="default" className="text-xs bg-primary/10 text-primary border-primary/20">
                    Printed
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {formatDistanceToNow(new Date(item.printed_at), { addSuffix: true })}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">No Label</Badge>
            )}
          </div>
        </div>
        
        {vendor && (
          <div>
            <span className="text-xs text-muted-foreground block">Vendor</span>
            <p className="text-sm">{vendor}</p>
          </div>
        )}
      </div>
    </div>
  );
});

InventorySection.displayName = 'InventorySection';
