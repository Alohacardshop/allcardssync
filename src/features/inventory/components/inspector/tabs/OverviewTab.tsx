import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow, format } from 'date-fns';
import { getLocationNickname } from '@/lib/locationNicknames';
import { ImageGallery } from '../../details/ImageGallery';
import type { InventoryListItem } from '../../../types';
import type { CachedLocation } from '@/hooks/useLocationNames';

interface OverviewTabProps {
  item: InventoryListItem;
  detailData?: {
    image_urls?: unknown;
    cost?: number | null;
    vendor?: string | null;
  } | null;
  locationsMap?: Map<string, CachedLocation>;
}

// Generate title from item
const generateTitle = (item: InventoryListItem): string => {
  const parts: (string | number | null | undefined)[] = [];
  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);
  if (item.grade && (item.psa_cert || item.cgc_cert)) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  }
  return parts.filter(Boolean).join(' ') || 'Unknown Item';
};

export const OverviewTab = React.memo(({ item, detailData, locationsMap }: OverviewTabProps) => {
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
  const title = generateTitle(item);

  return (
    <div className="space-y-5">
      {/* Images */}
      <ImageGallery imageUrls={detailData?.image_urls as string[] | null} />
      
      {/* Core Info */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Card Info</h4>
        
        <div className="space-y-2">
          <div>
            <span className="text-xs text-muted-foreground block">Title</span>
            <p className="text-sm font-medium">{title}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {item.year && (
              <div>
                <span className="text-xs text-muted-foreground block">Year</span>
                <p className="text-sm">{item.year}</p>
              </div>
            )}
            {item.brand_title && (
              <div>
                <span className="text-xs text-muted-foreground block">Set/Brand</span>
                <p className="text-sm">{item.brand_title}</p>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {item.card_number && (
              <div>
                <span className="text-xs text-muted-foreground block">Card #</span>
                <p className="text-sm">#{item.card_number}</p>
              </div>
            )}
            {item.variant && (
              <div>
                <span className="text-xs text-muted-foreground block">Variant</span>
                <p className="text-sm">{item.variant}</p>
              </div>
            )}
          </div>
          
          {(item.grade || item.psa_cert || item.cgc_cert) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground block">Condition</span>
                <p className="text-sm">
                  {item.grade 
                    ? `${item.grading_company || 'PSA'} ${item.grade}` 
                    : 'Raw'}
                </p>
              </div>
              {(item.psa_cert || item.cgc_cert) && (
                <div>
                  <span className="text-xs text-muted-foreground block">Cert #</span>
                  <p className="text-sm font-mono">{item.psa_cert || item.cgc_cert}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inventory Info */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inventory</h4>
        
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
              {cost != null ? `$${cost.toFixed(2)}` : <span className="text-muted-foreground text-sm">—</span>}
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
    </div>
  );
});

OverviewTab.displayName = 'OverviewTab';
