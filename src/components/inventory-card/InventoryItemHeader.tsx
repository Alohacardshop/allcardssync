import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, CheckSquare, Square, MapPin, Loader2, CheckCircle, Printer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EbayStatusBadge } from '@/components/inventory/EbayStatusBadge';
import { InventoryLockIndicator } from './InventoryLockIndicator';
import type { InventoryItem } from '@/types/inventory';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { getLocationDisplayInfoFromGid } from '@/hooks/useLocationNames';
import type { InventoryLock } from '@/hooks/useInventoryLocks';

interface InventoryItemHeaderProps {
  item: InventoryItem;
  title: string;
  isSelected: boolean;
  isExpanded: boolean;
  locationsMap?: Map<string, CachedLocation>;
  lockInfo?: InventoryLock | null;
  onToggleSelection: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
}

// Status badge logic
function getStatusBadge(item: InventoryItem & { sold_at?: string | null }) {
  if (item.deleted_at) {
    return <Badge variant="destructive">Deleted</Badge>;
  }
  if (item.sold_at) {
    return <Badge variant="secondary">Sold</Badge>;
  }
  
  const status = item.shopify_sync_status as string | null;
  
  if (status === 'error') {
    return <Badge variant="destructive">Sync Error</Badge>;
  }
  if (status === 'synced' && item.shopify_product_id) {
    return <Badge variant="default">Synced</Badge>;
  }
  if (status === 'queued' || status === 'processing') {
    return (
      <Badge variant="outline" className="bg-accent/50 text-accent-foreground border-accent">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Syncing
      </Badge>
    );
  }
  if (status === 'pending') {
    return <Badge variant="outline">Pending</Badge>;
  }
  if (item.shopify_product_id && status !== 'synced') {
    return <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning">Needs Resync</Badge>;
  }
  return <Badge variant="outline">Not Synced</Badge>;
}

function getPrintStatusBadge(item: InventoryItem) {
  if (item.printed_at) {
    return (
      <Badge variant="default" className="bg-primary/10 text-primary border-primary/30">
        <CheckCircle className="h-3 w-3 mr-1" />
        Printed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      <Printer className="h-3 w-3 mr-1" />
      Not Printed
    </Badge>
  );
}

export const InventoryItemHeader = memo(({
  item,
  title,
  isSelected,
  isExpanded,
  locationsMap,
  lockInfo,
  onToggleSelection,
  onToggleExpanded,
}: InventoryItemHeaderProps) => {
  return (
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleSelection(item.id)}
            className="p-1 h-auto"
          >
            {isSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
          
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              {title}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">
                {item.sku}
              </span>
              {item.shopify_location_gid && locationsMap && (() => {
                const { nickname, fullName } = getLocationDisplayInfoFromGid(item.shopify_location_gid, locationsMap);
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-muted/50 cursor-help">
                        <MapPin className="h-3 w-3 mr-1" />
                        {nickname}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">{fullName}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
              {getStatusBadge(item)}
              {getPrintStatusBadge(item)}
              {lockInfo && (
                <InventoryLockIndicator
                  lockType={lockInfo.lock_type}
                  lockedBy={lockInfo.locked_by}
                  expiresAt={lockInfo.expires_at}
                />
              )}
              <EbayStatusBadge
                syncStatus={item.ebay_sync_status}
                listingId={item.ebay_listing_id}
                listingUrl={item.ebay_listing_url}
                syncError={item.ebay_sync_error}
                listOnEbay={item.list_on_ebay}
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleExpanded(item.id)}
              >
                {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isExpanded ? 'Hide details' : 'Show details'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </CardHeader>
  );
});

InventoryItemHeader.displayName = 'InventoryItemHeader';
