import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/contexts/StoreContext";
import { MapPin } from "lucide-react";

interface LocationSelectorProps {
  className?: string;
}

export function LocationSelector({ className }: LocationSelectorProps) {
  const { 
    selectedLocation, 
    setSelectedLocation, 
    availableLocations, 
    loadingLocations,
    selectedStore 
  } = useStore();

  if (!selectedStore || availableLocations.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <Select 
        value={selectedLocation || ""} 
        onValueChange={setSelectedLocation}
        disabled={loadingLocations}
      >
        <SelectTrigger className="w-[200px]">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <SelectValue placeholder={loadingLocations ? "Loading..." : "Select location"} />
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