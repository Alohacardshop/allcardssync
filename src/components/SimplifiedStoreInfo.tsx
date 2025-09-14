import { Badge } from "@/components/ui/badge";
import { useStore } from "@/contexts/StoreContext";
import { Store, MapPin } from "lucide-react";

export function SimplifiedStoreInfo() {
  const { assignedStore, assignedStoreName, selectedLocation, availableLocations } = useStore();

  if (!assignedStore) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Store className="h-4 w-4" />
        <span>No store assigned</span>
      </div>
    );
  }

  const locationName = availableLocations.find(l => l.gid === selectedLocation)?.name;

  return (
    <div className="flex items-center gap-2">
      <Store className="h-4 w-4 text-muted-foreground" />
      <Badge variant="outline" className="flex items-center gap-1">
        {assignedStoreName || assignedStore}
      </Badge>
      {locationName && (
        <div className="flex items-center gap-1">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <Badge variant="secondary" className="text-xs">
            {locationName}
          </Badge>
        </div>
      )}
    </div>
  );
}