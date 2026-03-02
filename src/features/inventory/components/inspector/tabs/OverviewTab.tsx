import React, { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { getLocationNickname } from '@/lib/locationNicknames';
import { ImageGallery } from '../../details/ImageGallery';
import { EditableField } from '../EditableField';
import { InlineQuantityEditor } from '@/components/inventory-card/InlineQuantityEditor';
import type { InventoryListItem } from '../../../types';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { formatGrade } from '@/lib/labelData';

interface OverviewTabProps {
  item: InventoryListItem;
  detailData?: {
    image_urls?: unknown;
    cost?: number | null;
    vendor?: string | null;
  } | null;
  locationsMap?: Map<string, CachedLocation>;
  onFieldSave?: (updates: Record<string, string | number>) => void;
  isSaving?: boolean;
}

export const OverviewTab = React.memo(({ item, detailData, locationsMap, onFieldSave, isSaving }: OverviewTabProps) => {
  const locationName = item.shopify_location_gid 
    ? locationsMap?.get(item.shopify_location_gid)?.location_name || 'Unknown'
    : 'No location';
  const nickname = getLocationNickname(locationName);
  
  const cost = item.cost ?? detailData?.cost;
  const vendor = detailData?.vendor ?? item.vendor;
  
  const getStatus = () => {
    if (item.deleted_at) return { label: 'Deleted', variant: 'destructive' as const };
    if (item.sold_at) return { label: 'Sold', variant: 'secondary' as const };
    if (item.quantity === 0) return { label: 'Out of Stock', variant: 'outline' as const };
    return { label: 'Active', variant: 'default' as const };
  };
  
  const status = getStatus();
  const isDeleted = !!item.deleted_at || !!item.sold_at;

  const handleSave = useCallback((field: string) => (value: string | number) => {
    onFieldSave?.({ [field]: value });
  }, [onFieldSave]);

  return (
    <div className="space-y-5">
      {/* Images */}
      <ImageGallery imageUrls={detailData?.image_urls as string[] | null} />
      
      {/* Core Info */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Card Info</h4>
        
        <div className="space-y-2">
          <EditableField
            label="Subject"
            value={item.subject}
            onSave={handleSave('subject')}
            disabled={isDeleted}
          />
          
          <div className="grid grid-cols-2 gap-3">
            <EditableField
              label="Year"
              value={item.year}
              onSave={handleSave('year')}
              disabled={isDeleted}
            />
            <EditableField
              label="Set/Brand"
              value={item.brand_title}
              onSave={handleSave('brand_title')}
              disabled={isDeleted}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <EditableField
              label="Card #"
              value={item.card_number}
              onSave={handleSave('card_number')}
              disabled={isDeleted}
            />
            <EditableField
              label="Variant"
              value={item.variant}
              onSave={handleSave('variant')}
              disabled={isDeleted}
            />
          </div>
          
          {(item.grade || item.psa_cert || item.cgc_cert) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground block">Condition</span>
                <p className="text-sm">
                  {item.grade 
                    ? `${item.grading_company || 'PSA'} ${formatGrade(item.grade)}` 
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
            <div className="mt-0.5">
              <InlineQuantityEditor
                itemId={item.id}
                quantity={item.quantity}
                shopifyProductId={item.shopify_product_id}
                shopifyInventoryItemId={item.shopify_inventory_item_id}
                readOnly={isDeleted}
              />
            </div>
          </div>
          
          <EditableField
            label="Price"
            value={item.price}
            type="currency"
            onSave={handleSave('price')}
            disabled={isDeleted}
          />
          
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

      {/* Sync indicator */}
      {isSaving && (
        <p className="text-xs text-muted-foreground animate-pulse">Saving & syncing to marketplaces…</p>
      )}
    </div>
  );
});

OverviewTab.displayName = 'OverviewTab';
