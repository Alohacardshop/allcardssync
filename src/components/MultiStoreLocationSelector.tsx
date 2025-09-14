import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/contexts/StoreContext";
import { 
  Store, 
  MapPin, 
  Search, 
  RefreshCw, 
  ChevronDown,
  X,
  CheckSquare
} from "lucide-react";

interface SelectedStoreLocation {
  storeKey: string;
  storeName: string;
  locationGid: string;
  locationName: string;
}

interface MultiStoreLocationSelectorProps {
  className?: string;
  selectedItems: SelectedStoreLocation[];
  onChange: (items: SelectedStoreLocation[]) => void;
}

export function MultiStoreLocationSelector({ 
  className, 
  selectedItems, 
  onChange 
}: MultiStoreLocationSelectorProps) {
  const {
    assignedStore,
    assignedStoreName,
    userAssignments
  } = useStore();

  const [open, setOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedStoreKey, setSelectedStoreKey] = useState<string>("");
  const [storeLocations, setStoreLocations] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Since we now only support single store per user, we'll disable store selection
  const filteredStores: any[] = [];

  const filteredLocations = selectedStoreKey 
    ? storeLocations.filter(location =>
        location.name.toLowerCase().includes(locationSearch.toLowerCase())
      )
    : [];

  const isStoreLocationSelected = (storeKey: string, locationGid: string) => {
    return selectedItems.some(item => 
      item.storeKey === storeKey && item.locationGid === locationGid
    );
  };

  const handleStoreLocationToggle = (storeKey: string, locationGid: string) => {
    // Simplified since users can only have one store now
    const location = storeLocations.find(l => l.gid === locationGid);
    
    if (!assignedStore || !location) return;

    const isSelected = isStoreLocationSelected(storeKey, locationGid);
    
    if (isSelected) {
      // Remove the selection
      onChange(selectedItems.filter(item => 
        !(item.storeKey === storeKey && item.locationGid === locationGid)
      ));
    } else {
      // Add the selection
      onChange([...selectedItems, {
        storeKey: assignedStore,
        storeName: assignedStoreName || assignedStore,
        locationGid,
        locationName: location.name
      }]);
    }
  };

  const handleSelectAllForStore = (storeKey: string) => {
    if (storeKey !== assignedStore) return;
    const newSelections: any[] = [];
    
    storeLocations.forEach(location => {
      if (!isStoreLocationSelected(storeKey, location.gid)) {
        newSelections.push({
          storeKey: assignedStore,
          storeName: assignedStoreName || assignedStore,
          locationGid: location.gid,
          locationName: location.name
        });
      }
    });

    onChange([...selectedItems, ...newSelections]);
  };

  const handleSelectAllAssigned = () => {
    const allAssigned: any[] = [];
    
    userAssignments.forEach(assignment => {
      if (assignment.store_key !== assignedStore) return;

      if (assignment.location_gid) {
        // Specific location assignment - find in current store locations if this is the selected store
        let location = null;
        if (assignment.store_key === selectedStoreKey) {
          location = storeLocations.find(l => l.gid === assignment.location_gid);
        }
        if (location && !isStoreLocationSelected(assignment.store_key, assignment.location_gid)) {
          allAssigned.push({
            storeKey: assignment.store_key,
            storeName: assignedStoreName || assignment.store_key,
            locationGid: assignment.location_gid,
            locationName: location.name
          });
        }
      }
    });

    onChange([...selectedItems, ...allAssigned]);
  };

  const removeSelection = (storeKey: string, locationGid: string) => {
    onChange(selectedItems.filter(item => 
      !(item.storeKey === storeKey && item.locationGid === locationGid)
    ));
  };

  const clearAll = () => {
    onChange([]);
  };

  const loadLocationsForStore = async (storeKey: string) => {
    setLoadingLocations(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey }
      });
      
      if (error) throw error;
      
      if (data?.ok) {
        const locations = (data.locations || []).map((loc: any) => ({
          id: String(loc.id),
          name: loc.name,
          gid: `gid://shopify/Location/${loc.id}`
        }));
        setStoreLocations(locations);
      } else {
        throw new Error(data?.error || "Failed to load locations");
      }
    } catch (error) {
      console.error("Error loading locations:", error);
      setStoreLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleStoreSelect = (storeKey: string) => {
    setSelectedStoreKey(storeKey);
    setLocationSearch("");
    setStoreLocations([]);
    // Load locations for the selected store
    loadLocationsForStore(storeKey);
  };

  const refreshLocationsForSelectedStore = () => {
    if (selectedStoreKey) {
      loadLocationsForStore(selectedStoreKey);
    }
  };

  return (
    <div className={className}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full justify-between h-auto p-4"
          >
            <div className="flex items-start gap-3 text-left">
              <div className="flex flex-col gap-1 mt-1">
                <Store className="h-4 w-4 text-muted-foreground" />
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {selectedItems.length === 0 
                    ? "All locations" 
                    : `${selectedItems.length} location${selectedItems.length !== 1 ? 's' : ''} selected`
                  }
                </span>
                <span className="text-sm text-muted-foreground">
                  {selectedItems.length === 0 
                    ? "Showing inventory from all assigned locations"
                    : "Showing inventory from selected locations"
                  }
                </span>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Select Store & Location Combinations
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
            {/* Store Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Stores</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {}}
                  disabled={true}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stores..."
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2">
                  <div className="text-center py-8 text-muted-foreground">
                    Store switching disabled - users now use single assigned store
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Location Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Locations</h3>
                <div className="flex gap-2">
                  {selectedStoreKey && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSelectAllForStore(selectedStoreKey)}
                    >
                      <CheckSquare className="h-3 w-3 mr-1" />
                      All
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={refreshLocationsForSelectedStore}
                    disabled={loadingLocations || !selectedStoreKey}
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search locations..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="pl-9"
                  disabled={!selectedStoreKey}
                />
              </div>

              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2">
                  {!selectedStoreKey ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Please select a store first
                    </div>
                  ) : loadingLocations ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Loading locations...
                    </div>
                  ) : filteredLocations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {locationSearch ? "No locations found" : "No locations available"}
                    </div>
                  ) : (
                    filteredLocations.map((location) => (
                      <div
                        key={location.gid}
                        className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={isStoreLocationSelected(selectedStoreKey, location.gid)}
                          onCheckedChange={() => handleStoreLocationToggle(selectedStoreKey, location.gid)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{location.name}</div>
                          <div className="text-sm text-muted-foreground">ID: {location.id}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Selected Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Selected ({selectedItems.length})</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleSelectAllAssigned}
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    All Assigned
                  </Button>
                  {selectedItems.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={clearAll}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-2">
                  {selectedItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No specific locations selected.<br />
                      Showing all assigned locations.
                    </div>
                  ) : (
                    selectedItems.map((item) => (
                      <div
                        key={`${item.storeKey}-${item.locationGid}`}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{item.storeName}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.locationName}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelection(item.storeKey, item.locationGid)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end pt-4 border-t">
            <Button onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}