import React, { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { getLocationNickname } from '@/lib/locationNicknames';
import { ImageGallery } from '../../details/ImageGallery';
import { EditableField } from '../EditableField';
import { InlineQuantityEditor } from '@/components/inventory-card/InlineQuantityEditor';
import { useEbayListing } from '@/hooks/useEbayListing';
import { useServiceFlags } from '@/hooks/useServiceFlags';
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
  onResync?: (item: InventoryListItem) => void;
  isResyncing?: boolean;
  isSaving?: boolean;
}

export const OverviewTab = React.memo(({ item, detailData, locationsMap, onFieldSave, onResync, isResyncing, isSaving }: OverviewTabProps) => {
  const { toggleListOnEbay, isToggling, resyncToEbay, isResyncing: isEbayResyncing } = useEbayListing();
  const { ebayEnabled } = useServiceFlags();

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

  // Shopify sync status
  const shopifySyncStatus = item.shopify_sync_status as string | null;
  const getShopifyBadge = () => {
    if (shopifySyncStatus === 'error') return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Error</Badge>;
    if (shopifySyncStatus === 'synced' || item.shopify_product_id) return <Badge variant="default" className="text-[10px] h-5 px-1.5">Synced</Badge>;
    if (shopifySyncStatus === 'queued' || shopifySyncStatus === 'processing') return <Badge variant="outline" className="text-[10px] h-5 px-1.5 animate-pulse">Syncing</Badge>;
    if (shopifySyncStatus === 'pending') return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Pending</Badge>;
    return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Not Synced</Badge>;
  };

  // eBay status
  const ebayStatus = item.ebay_sync_status;
  const ebayError = item.ebay_sync_error;
  const listOnEbay = item.list_on_ebay;
  const isListed = ebayStatus === 'synced' && item.ebay_listing_id;

  const getEbayBadge = () => {
    if (isListed) return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-blue-600 hover:bg-blue-700 text-white border-blue-600">Listed</Badge>;
    if (ebayStatus === 'error') return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Error</Badge>;
    if (ebayStatus === 'queued' || ebayStatus === 'processing') return <Badge variant="outline" className="text-[10px] h-5 px-1.5 animate-pulse">Syncing</Badge>;
    if (ebayStatus === 'pending') return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Pending</Badge>;
    if (listOnEbay) return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Queued</Badge>;
    return null;
  };

  const handleEbayToggle = () => {
    toggleListOnEbay(item.id, listOnEbay || false);
  };

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
              label={!item.grade || item.type?.toLowerCase() === 'raw' ? "Condition" : "Variant"}
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
                isGraded={!!(item.grading_company && item.grading_company !== 'none')}
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

      {/* Marketplace Controls — always visible */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Marketplace</h4>
        
        <div className="border border-border rounded-lg divide-y divide-border">
          {/* Shopify row — also resyncs eBay if listed */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 min-h-[40px] px-3 py-2">
            <span className="text-sm font-medium">Shopify</span>
            <div className="flex items-center">{getShopifyBadge()}</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResync?.(item)}
                  disabled={isResyncing || isDeleted}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  {isResyncing ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  {isListed && ebayEnabled ? 'Resync All' : 'Resync'}
                </Button>
              </TooltipTrigger>
              {isListed && ebayEnabled && (
                <TooltipContent side="bottom">Resyncs to both Shopify & eBay</TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* eBay row - only when eBay is enabled for the region */}
          {ebayEnabled && (
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 min-h-[40px] px-3 py-2">
              <span className="text-sm font-medium">eBay</span>
              <div className="flex items-center">
                {ebayStatus === 'error' && ebayError ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 cursor-help">
                        Error
                        <AlertCircle className="h-2.5 w-2.5 ml-1" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                      {ebayError}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  getEbayBadge()
                )}
              </div>
              {isListed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resyncToEbay(item.id)}
                  disabled={isEbayResyncing === item.id || isDeleted}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  {isEbayResyncing === item.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Resync
                </Button>
              )}
              <Switch
                checked={listOnEbay || false}
                onCheckedChange={handleEbayToggle}
                disabled={isToggling === item.id || isDeleted}
                className="border border-border"
              />
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
