import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MapPin, Package, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useInventoryLevels, enrichLevelsWithNames } from '@/hooks/useInventoryLevels';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { formatDistanceToNow } from 'date-fns';

interface StockByLocationSectionProps {
  inventoryItemId: string | null | undefined;
  locationsMap?: Map<string, CachedLocation>;
  primaryLocationGid?: string | null;
}

export function StockByLocationSection({
  inventoryItemId,
  locationsMap,
  primaryLocationGid,
}: StockByLocationSectionProps) {
  const { data: levels, isLoading, error } = useInventoryLevels(inventoryItemId);

  if (!inventoryItemId) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Stock by Location
        </div>
        <p className="text-sm text-muted-foreground">
          No Shopify inventory item linked. Sync to Shopify to track multi-location stock.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Stock by Location
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading inventory levels...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Stock by Location
        </div>
        <p className="text-sm text-destructive">Failed to load inventory levels</p>
      </div>
    );
  }

  const enrichedLevels = enrichLevelsWithNames(levels || [], locationsMap);
  const totalStock = enrichedLevels.reduce((sum, l) => sum + Math.max(0, l.available), 0);
  const locationsWithStock = enrichedLevels.filter(l => l.available > 0);

  if (enrichedLevels.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Stock by Location
        </div>
        <p className="text-sm text-muted-foreground">
          No inventory level data from Shopify webhooks yet. Stock updates will appear after Shopify sends inventory_levels/update webhooks.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Stock by Location
        </div>
        <Badge variant="outline" className="text-xs">
          <Package className="h-3 w-3 mr-1" />
          {totalStock} total across {locationsWithStock.length} location{locationsWithStock.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="space-y-2">
        {enrichedLevels.map((level) => {
          const isPrimary = level.location_gid === primaryLocationGid;
          const lastUpdated = level.shopify_updated_at || level.updated_at;

          return (
            <div
              key={level.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-md border",
                isPrimary && "bg-primary/5 border-primary/20",
                level.available === 0 && "opacity-60"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn(
                        "text-sm truncate cursor-help",
                        isPrimary && "font-medium"
                      )}>
                        {level.displayName}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">{level.fullName}</p>
                    </TooltipContent>
                  </Tooltip>
                  {isPrimary && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      Primary
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
                </div>
              </div>

              <div className="flex items-center gap-3 ml-4">
                <div className={cn(
                  "text-right",
                  level.available === 0 && "text-muted-foreground"
                )}>
                  <div className={cn(
                    "text-lg font-semibold tabular-nums",
                    level.available > 0 && "text-foreground",
                    level.available === 0 && "text-muted-foreground"
                  )}>
                    {level.available}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Available
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
