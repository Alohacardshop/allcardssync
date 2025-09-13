import { useStore } from "@/contexts/StoreContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Palmtree, Dice1 } from "lucide-react";
import { useState, useEffect } from "react";

export function StoreToggle() {
  const { 
    selectedStore, 
    selectedLocation, 
    availableStores, 
    availableLocations, 
    setSelectedStore,
    setSelectedLocation,
    loadingStores,
    userAssignments 
  } = useStore();
  
  const [userStores, setUserStores] = useState<string[]>([]);

  useEffect(() => {
    if (userAssignments && userAssignments.length > 0) {
      const uniqueStores = [...new Set(userAssignments.map(assignment => assignment.store_key))];
      setUserStores(uniqueStores);
    }
  }, [userAssignments]);

  // Only show toggle if user has access to multiple stores
  if (loadingStores || userStores.length <= 1) {
    return null;
  }

  const getStoreIcon = (storeKey: string) => {
    switch (storeKey) {
      case 'hawaii':
        return <Palmtree className="h-4 w-4" />;
      case 'las_vegas':
        return <Dice1 className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getStoreName = (storeKey: string) => {
    const store = availableStores.find(s => s.key === storeKey);
    return store?.name || storeKey.replace('_', ' ').toUpperCase();
  };

  const getLocationName = (gid: string) => {
    const location = availableLocations.find(l => l.gid === gid);
    return location?.name || 'Select Location';
  };

  const handleStoreSelect = (storeKey: string) => {
    setSelectedStore(storeKey);
    // Auto-select first available location for the store
    const storeAssignments = userAssignments?.filter(a => a.store_key === storeKey) || [];
    if (storeAssignments.length > 0) {
      setSelectedLocation(storeAssignments[0].location_gid || '');
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-muted">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Current Store:
      </div>
      
      <div className="flex items-center gap-2">
        {userStores.map((storeKey) => {
          const isActive = selectedStore === storeKey;
          const storeName = getStoreName(storeKey);
          const locationName = selectedLocation && isActive ? getLocationName(selectedLocation) : null;
          
          return (
            <Button
              key={storeKey}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => handleStoreSelect(storeKey)}
              className={`flex items-center gap-2 h-8 ${
                isActive 
                  ? storeKey === 'hawaii' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' 
                    : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                  : 'hover:bg-muted'
              }`}
            >
              {getStoreIcon(storeKey)}
              <span className="font-medium">{storeName}</span>
              {isActive && locationName && (
                <Badge 
                  variant="secondary" 
                  className={`ml-1 text-xs ${
                    storeKey === 'hawaii' 
                      ? 'bg-blue-100 text-blue-800 border-blue-200' 
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {locationName}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
      
      {selectedStore && selectedLocation && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Active
        </Badge>
      )}
    </div>
  );
}