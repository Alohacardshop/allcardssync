import React from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/contexts/StoreContext";
import { Store, MapPin, ChevronDown, Check, RefreshCw } from "lucide-react";

export function CompactLocationSelector() {
  const { 
    assignedStore,
    assignedStoreName,
    selectedLocation, 
    setSelectedLocation,
    availableLocations,
    loadingLocations,
    refreshLocations
  } = useStore();

  // Get the selected location name
  const selectedLocationName = availableLocations?.find(l => l.gid === selectedLocation)?.name || "No Location";

  const handleLocationSelect = (locationGid: string) => {
    setSelectedLocation(locationGid);
  };

  const handleRefreshLocations = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    refreshLocations();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-auto py-2 px-3 border-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-start">
              <Store className="h-3 w-3 text-muted-foreground" />
              <MapPin className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex flex-col items-start text-sm">
              <span className="font-medium text-foreground">
                {assignedStoreName || "No Store"}
              </span>
              <span className="text-muted-foreground truncate max-w-32">
                {selectedLocationName}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 opacity-50 ml-1" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-64 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border-2 z-50">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Store className="h-4 w-4" />
          {assignedStoreName || assignedStore || "No Store Assigned"}
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Locations
          </DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleRefreshLocations}
            disabled={loadingLocations || !assignedStore}
          >
            <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {!assignedStore ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">No store assigned</span>
          </DropdownMenuItem>
        ) : loadingLocations ? (
          <DropdownMenuItem disabled>
            <RefreshCw className="h-3 w-3 animate-spin mr-2" />
            Loading locations...
          </DropdownMenuItem>
        ) : availableLocations && availableLocations.length > 0 ? (
          availableLocations.map((location) => (
            <DropdownMenuItem
              key={location.gid}
              onClick={() => handleLocationSelect(location.gid)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex flex-col">
                <span className="font-medium">{location.name}</span>
                <span className="text-xs text-muted-foreground">ID: {location.id}</span>
              </div>
              {selectedLocation === location.gid && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">No locations available</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}