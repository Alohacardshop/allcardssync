import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Store, 
  MapPin, 
  Search, 
  Star, 
  RefreshCw, 
  ChevronDown,
  Check
} from "lucide-react";

interface StoreLocationPickerProps {
  className?: string;
  showSetDefault?: boolean;
}

export function StoreLocationPicker({ className, showSetDefault = true }: StoreLocationPickerProps) {
  const { 
    assignedStore,
    selectedLocation, 
    setSelectedLocation,
    availableLocations,
    loadingLocations,
    locationsLastUpdated,
    userAssignments,
    refreshUserAssignments,
    refreshLocations
  } = useStore();

  const [open, setOpen] = useState(false);
const [storeSearch, setStoreSearch] = useState("");
const [locationSearch, setLocationSearch] = useState("");
const [autoSaveDefault, setAutoSaveDefault] = useState<boolean>(() => {
  try {
    return localStorage.getItem("storeLocation:autoSaveDefault") !== "false";
  } catch {
    return true;
  }
});

  const selectedStoreName = availableStores.find(s => s.key === selectedStore)?.name || "No store selected";
  const selectedLocationName = availableLocations.find(l => l.gid === selectedLocation)?.name || "No location selected";
  
  const isCurrentDefault = userAssignments.some(
    assignment => 
      assignment.store_key === selectedStore && 
      assignment.location_gid === selectedLocation && 
      assignment.is_default
  );

  const filteredStores = availableStores.filter(store =>
    store.name.toLowerCase().includes(storeSearch.toLowerCase())
  );

  const filteredLocations = availableLocations.filter(location =>
    location.name.toLowerCase().includes(locationSearch.toLowerCase())
  );

const handleStoreSelect = (storeKey: string) => {
  setSelectedStore(storeKey);
  setSelectedLocation(null); // Reset location when store changes
  setLocationSearch("");
  // Auto-refresh locations for the newly selected store
  setTimeout(() => {
    refreshLocations();
  }, 0);
};

const handleLocationSelect = async (gid: string) => {
  setSelectedLocation(gid);
  if (autoSaveDefault && selectedStore) {
    try {
      const { error } = await supabase.rpc("set_user_default_location", {
        _store_key: selectedStore,
        _location_gid: gid
      });
      if (error) throw error;
      toast.success("Default store/location saved");
      await refreshUserAssignments();
    } catch (err) {
      console.error("Auto-save default failed", err);
      toast.error("Failed to auto-save default");
    }
  }
};

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

      toast.success("Default store and location updated");
      await refreshUserAssignments();
      setOpen(false);
    } catch (error) {
      console.error("Failed to set default:", error);
      toast.error("Failed to set default location");
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
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedStoreName}</span>
                  {isCurrentDefault && (
                    <Star className="h-3 w-3 fill-current text-yellow-500" />
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {selectedLocationName}
                </span>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Select Store & Location
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Store Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Stores</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={refreshStores}
                  disabled={loadingStores}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingStores ? 'animate-spin' : ''}`} />
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
                  {loadingStores ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Loading stores...
                    </div>
                  ) : filteredStores.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {storeSearch ? "No stores found" : "No stores available"}
                    </div>
                  ) : (
                    filteredStores.map((store) => (
                      <button
                        key={store.key}
                        onClick={() => handleStoreSelect(store.key)}
                        className={`w-full text-left p-3 rounded-md hover:bg-muted transition-colors flex items-center justify-between ${
                          selectedStore === store.key ? 'bg-muted' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium">{store.name}</div>
                          <div className="text-sm text-muted-foreground">{store.vendor}</div>
                        </div>
                        {selectedStore === store.key && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Location Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Locations</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={refreshLocations}
                  disabled={loadingLocations || !selectedStore}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search locations..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="pl-9"
                  disabled={!selectedStore}
                />
              </div>

              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2">
                  {!selectedStore ? (
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
                      <button
                        key={location.gid}
                        onClick={() => handleLocationSelect(location.gid)}
                        className={`w-full text-left p-3 rounded-md hover:bg-muted transition-colors flex items-center justify-between ${
                          selectedLocation === location.gid ? 'bg-muted' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium">{location.name}</div>
                          <div className="text-sm text-muted-foreground">ID: {location.id}</div>
                        </div>
                        {selectedLocation === location.gid && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              {locationsLastUpdated && availableLocations.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {locationsLastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-3 flex-wrap">
              {isCurrentDefault && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  Current Default
                </Badge>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  checked={autoSaveDefault}
                  onCheckedChange={(val) => {
                    setAutoSaveDefault(val);
                    try { localStorage.setItem("storeLocation:autoSaveDefault", String(val)); } catch {}
                  }}
                />
                <span className="text-sm text-muted-foreground">Auto-save default</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              {showSetDefault && selectedStore && selectedLocation && !isCurrentDefault && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSetDefault}
                  className="flex items-center gap-2"
                >
                  <Star className="h-4 w-4" />
                  Set as Default
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}