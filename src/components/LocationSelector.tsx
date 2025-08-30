import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/contexts/StoreContext";
import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocalStorageString } from "@/hooks/useLocalStorage";

interface LocationSelectorProps {
  className?: string;
}

export function LocationSelector({ className }: LocationSelectorProps) {
  const { 
    selectedLocation, 
    setSelectedLocation, 
    availableLocations, 
    loadingLocations,
    selectedStore,
    isAdmin
  } = useStore();

  const [lastSelectedLocation, setLastSelectedLocation] = useLocalStorageString(
    `last-location-${selectedStore}`, 
    ""
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
                <SelectValue placeholder="No locations available" />
              </div>
            </SelectTrigger>
          </Select>
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
        <SelectContent>
          {availableLocations.map((location) => (
            <SelectItem key={location.gid} value={location.gid}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}