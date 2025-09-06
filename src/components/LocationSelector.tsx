import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/contexts/StoreContext";
import { MapPin, ExternalLink, Star, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocalStorageString } from "@/hooks/useLocalStorage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LocationSelectorProps {
  className?: string;
}

export function LocationSelector({ className }: LocationSelectorProps) {
  const { 
    selectedLocation, 
    setSelectedLocation, 
    availableLocations, 
    loadingLocations,
    locationsLastUpdated,
    selectedStore,
    isAdmin,
    userAssignments,
    refreshUserAssignments,
    refreshLocations
  } = useStore();

  const [lastSelectedLocation, setLastSelectedLocation] = useLocalStorageString(
    `last-location-${selectedStore}`, 
    ""
  );

  const handleSetDefault = async () => {
    if (!selectedStore || !selectedLocation) {
      toast.error("Please select both store and location first");
      return;
    }

    try {
      const { error } = await supabase.rpc("set_user_default_location", {
        _store_key: selectedStore,
        _location_gid: selectedLocation
      });

      if (error) throw error;

      const locationName = availableLocations.find(l => l.gid === selectedLocation)?.name;
      toast.success(`Set ${locationName} as default for ${selectedStore}`);
      
      // Refresh user assignments to reflect the new default
      await refreshUserAssignments();
    } catch (error) {
      console.error("Failed to set default:", error);
      toast.error("Failed to set default location");
    }
  };

  const isCurrentDefault = userAssignments.some(
    assignment => 
      assignment.store_key === selectedStore && 
      assignment.location_gid === selectedLocation && 
      assignment.is_default
  );

  // Auto-select single available location or restore last selection
  useEffect(() => {
    if (!selectedStore || loadingLocations) return;

    if (availableLocations.length === 1 && !selectedLocation) {
      // Auto-select if only one location available
      setSelectedLocation(availableLocations[0].gid);
      setLastSelectedLocation(availableLocations[0].gid);
    } else if (availableLocations.length > 1 && !selectedLocation && lastSelectedLocation) {
      // Restore last selection if it's still available
      const lastLocationExists = availableLocations.some(loc => loc.gid === lastSelectedLocation);
      if (lastLocationExists) {
        setSelectedLocation(lastSelectedLocation);
      }
    }
  }, [availableLocations, selectedLocation, selectedStore, loadingLocations, lastSelectedLocation, setSelectedLocation, setLastSelectedLocation]);

  // Save selection to local storage when changed
  useEffect(() => {
    if (selectedLocation) {
      setLastSelectedLocation(selectedLocation);
    }
  }, [selectedLocation, setLastSelectedLocation]);

  // Show helpful message when no store selected
  if (!selectedStore) {
    return (
      <div className={className}>
        <Select disabled>
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <SelectValue placeholder="Select store first" />
            </div>
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  // Show loading state
  if (loadingLocations) {
    return (
      <div className={className}>
        <Select disabled>
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <SelectValue placeholder="Loading locations..." />
            </div>
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  // Show helpful message when no locations available
  if (availableLocations.length === 0) {
    return (
      <div className={className}>
        <div className="space-y-2">
          <Select disabled>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <SelectValue placeholder={locationsLastUpdated ? "No locations found" : "Click refresh to load locations"} />
              </div>
            </SelectTrigger>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={refreshLocations}
            disabled={loadingLocations}
            className="w-full flex items-center gap-2"
          >
            <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
            {loadingLocations ? "Refreshing..." : "Refresh Locations"}
          </Button>
          
          {locationsLastUpdated && (
            <div className="text-xs space-y-1">
              <p className="text-muted-foreground">
                No locations found for {selectedStore}
              </p>
              <p className="text-muted-foreground">
                Check Admin &gt; Shopify Config for details
              </p>
            </div>
          )}
          
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => window.open(`https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/auth/users`, '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Manage User Assignments
            </Button>
          )}
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Contact admin to assign locations
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-1">
        <Select 
          value={selectedLocation || ""} 
          onValueChange={setSelectedLocation}
        >
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <SelectValue placeholder="Select location" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-background border-border z-50">
            {availableLocations.map((location) => (
              <SelectItem key={location.gid} value={location.gid} className="text-foreground hover:bg-accent">
                <div className="flex items-center justify-between w-full">
                  <span>{location.name}</span>
                  {userAssignments.some(a => 
                    a.store_key === selectedStore && 
                    a.location_gid === location.gid && 
                    a.is_default
                  ) && (
                    <Star className="h-3 w-3 text-yellow-500 ml-2" />
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="flex gap-2">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={refreshLocations}
            disabled={loadingLocations}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
            {loadingLocations ? "Refreshing..." : "Refresh"}
          </Button>
          
          {/* Set as Default Button */}
          {selectedLocation && selectedStore && !isCurrentDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetDefault}
              className="flex items-center gap-2"
            >
              <Star className="h-3 w-3" />
              Set as Default
            </Button>
          )}
        </div>
        
        {selectedStore && availableLocations.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              {selectedStore}: {availableLocations.length} location{availableLocations.length !== 1 ? 's' : ''} available
              {isCurrentDefault && selectedLocation && (
                <span className="text-yellow-600 ml-1">(Current Default)</span>
              )}
            </p>
            {locationsLastUpdated && (
              <p>
                Last updated: {locationsLastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}