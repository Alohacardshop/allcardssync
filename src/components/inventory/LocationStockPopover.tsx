import React from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CachedLocation } from '@/hooks/useLocationNames';
import { getShortLocationName, getLocationName } from '@/hooks/useLocationNames';

interface LocationStock {
  location_gid: string;
  location_name?: string | null;
  available: number;
}

interface LocationStockPopoverProps {
  primaryLocationGid: string | null | undefined;
  locationsMap?: Map<string, CachedLocation>;
  allLocationStock?: LocationStock[];
  className?: string;
}

export function LocationStockPopover({
  primaryLocationGid,
  locationsMap,
  allLocationStock,
  className,
}: LocationStockPopoverProps) {
  // If no primary location, show placeholder
  if (!primaryLocationGid) {
    return (
      <span className={cn("text-muted-foreground/50", className)}>—</span>
    );
  }

  const shortName = getShortLocationName(primaryLocationGid, locationsMap);
  const fullName = getLocationName(primaryLocationGid, locationsMap);

  // If no multi-location stock data, just show the primary location
  if (!allLocationStock || allLocationStock.length <= 1) {
    return (
      <span className={cn("text-xs text-muted-foreground truncate", className)} title={fullName}>
        {shortName}
      </span>
    );
  }

  // Calculate total stock
  const totalStock = allLocationStock.reduce((sum, loc) => sum + Math.max(0, loc.available), 0);
  const locationsWithStock = allLocationStock.filter(loc => loc.available > 0);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button 
          type="button"
          className={cn(
            "text-xs text-muted-foreground truncate hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer",
            className
          )}
        >
          <span>{shortName}</span>
          {locationsWithStock.length > 1 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal">
              +{locationsWithStock.length - 1}
            </Badge>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent 
        side="bottom" 
        align="start" 
        className="w-64 p-3"
        sideOffset={4}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Stock by Location
            </h4>
            <Badge variant="outline" className="text-xs font-normal">
              <Package className="h-3 w-3 mr-1" />
              {totalStock} total
            </Badge>
          </div>
          
          <div className="space-y-1.5">
            {allLocationStock.map((loc) => {
              const locationName = loc.location_name || 
                locationsMap?.get(loc.location_gid)?.location_name ||
                extractLocationId(loc.location_gid);
              const isPrimary = loc.location_gid === primaryLocationGid;
              
              return (
                <div 
                  key={loc.location_gid}
                  className={cn(
                    "flex items-center justify-between text-sm py-1 px-2 rounded",
                    isPrimary && "bg-primary/5 border border-primary/10",
                    loc.available === 0 && "text-muted-foreground"
                  )}
                >
                  <span className={cn(
                    "truncate flex-1",
                    isPrimary && "font-medium"
                  )}>
                    {locationName}
                    {isPrimary && (
                      <span className="text-[10px] text-muted-foreground ml-1">(primary)</span>
                    )}
                  </span>
                  <span className={cn(
                    "tabular-nums font-medium ml-2",
                    loc.available === 0 && "text-muted-foreground",
                    loc.available > 0 && "text-foreground"
                  )}>
                    {loc.available}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function extractLocationId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? `Location ${match[1]}` : gid;
}
