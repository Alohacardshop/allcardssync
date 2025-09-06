import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { MapPin, Star, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface LocationOption {
  gid: string;
  name: string;
  storeName: string;
  storeKey: string;
  displayName: string;
  isDefault?: boolean;
}

interface AllLocationsSelectorProps {
  className?: string;
  value?: string;
  onValueChange?: (locationGid: string | null) => void;
  placeholder?: string;
}

export function AllLocationsSelector({ 
  className, 
  value, 
  onValueChange, 
  placeholder = "Select location" 
}: AllLocationsSelectorProps) {
  const { setSelectedStore } = useStore();
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAssignments, setUserAssignments] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const loadUserAssignments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: assignments } = await supabase
        .from("user_shopify_assignments")
        .select("store_key, location_gid, location_name, is_default")
        .eq("user_id", user.id);
      
      setUserAssignments(assignments || []);
    } catch (error) {
      console.error("Error loading user assignments:", error);
    }
  };

  // Initial load only
  useEffect(() => {
    if (!hasInitialLoad) {
      loadAllAccessibleLocations();
    }
  }, [hasInitialLoad]);

  const loadAllAccessibleLocations = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: adminCheck } = await supabase.rpc("has_role", { 
        _user_id: user.id, 
        _role: "admin" 
      });
      const isUserAdmin = adminCheck || false;
      setIsAdmin(isUserAdmin);

      // Load user assignments for default status
      await loadUserAssignments();

      if (isUserAdmin) {
        // Admin can access all stores and locations
        const { data: stores } = await supabase
          .from("shopify_stores")
          .select("key, name")
          .order("name");

        if (!stores) return;

        const allLocations: LocationOption[] = [];
        
        // Load locations for each store
        for (const store of stores) {
          try {
            const { data, error } = await supabase.functions.invoke("shopify-locations", {
              body: { storeKey: store.key }
            });
            
            if (!error && data?.ok && data?.locations) {
              const storeLocations = data.locations.map((loc: any) => ({
                gid: `gid://shopify/Location/${loc.id}`,
                name: loc.name,
                storeName: store.name,
                storeKey: store.key,
                displayName: `${store.name} - ${loc.name}`,
                isDefault: userAssignments.some(a => 
                  a.store_key === store.key && 
                  a.location_gid === `gid://shopify/Location/${loc.id}` && 
                  a.is_default
                )
              }));
              allLocations.push(...storeLocations);
            }
          } catch (error) {
            console.error(`Error loading locations for store ${store.key}:`, error);
          }
        }

        setLocations(allLocations);
        setLastUpdated(new Date());
        
        // Auto-select default location only on first load
        if ((!value || value === "all") && !hasInitialLoad) {
          const defaultLocation = allLocations.find(loc => loc.isDefault);
          if (defaultLocation) {
            onValueChange?.(defaultLocation.gid);
          }
        }
      } else {
        // Non-admin users can only access assigned locations
        const { data: assignments } = await supabase
          .from("user_shopify_assignments")
          .select(`
            store_key, 
            location_gid, 
            location_name,
            is_default,
            shopify_stores!inner(name)
          `)
          .eq("user_id", user.id);

        if (assignments) {
          const userLocations = assignments.map((assignment: any) => ({
            gid: assignment.location_gid,
            name: assignment.location_name,
            storeName: assignment.shopify_stores.name,
            storeKey: assignment.store_key,
            displayName: `${assignment.shopify_stores.name} - ${assignment.location_name}`,
            isDefault: assignment.is_default
          }));
          setLocations(userLocations);
          setLastUpdated(new Date());
          
          // Auto-select default location only on first load
          if ((!value || value === "all") && !hasInitialLoad) {
            const defaultLocation = userLocations.find(loc => loc.isDefault);
            if (defaultLocation) {
              onValueChange?.(defaultLocation.gid);
            }
          }
        }
      }
      
      setHasInitialLoad(true);
    } catch (error) {
      console.error("Error loading accessible locations:", error);
      toast.error("Failed to load locations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (locationGid: string) => {
    const location = locations.find(l => l.gid === locationGid);
    if (!location) return;

    try {
      const { error } = await supabase.rpc("set_user_default_location", {
        _store_key: location.storeKey,
        _location_gid: locationGid
      });

      if (error) throw error;

      toast.success(`Set ${location.displayName} as default`);
      // Refresh assignments to update UI
      await loadUserAssignments();
      
      // Update the locations list to reflect new default
      setLocations(prev => prev.map(loc => ({
        ...loc,
        isDefault: loc.gid === locationGid && loc.storeKey === location.storeKey
      })));
    } catch (error) {
      console.error("Failed to set default:", error);
      toast.error("Failed to set default location");
    }
  };

  const handleValueChange = (selectedValue: string) => {
    const newValue = selectedValue === "all" ? null : selectedValue;
    onValueChange?.(newValue);

    // Keep store and location in sync
    if (newValue) {
      const loc = locations.find(l => l.gid === newValue);
      if (loc) setSelectedStore(loc.storeKey);
    } else {
      setSelectedStore(null);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-2">
        <Select 
          value={value || "all"} 
          onValueChange={handleValueChange}
          disabled={loading}
        >
          <SelectTrigger className="w-full bg-background border-border">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={loading ? "Loading locations..." : placeholder} />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-background border-border z-50">
            <SelectItem value="all" className="text-foreground">
              All Locations {isAdmin ? "(Admin)" : ""}
            </SelectItem>
            {locations.map((location) => (
              <SelectItem 
                key={location.gid} 
                value={location.gid}
                className="text-foreground hover:bg-accent"
              >
                <div className="flex items-center justify-between w-full">
                  <span>{location.displayName}</span>
                  {location.isDefault && (
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
            onClick={loadAllAccessibleLocations}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          
          {/* Set as Default Button */}
          {value && value !== "all" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetDefault(value)}
              className="flex items-center gap-2"
              disabled={locations.find(l => l.gid === value)?.isDefault}
            >
              <Star className="h-3 w-3" />
              {locations.find(l => l.gid === value)?.isDefault ? "Current Default" : "Set as Default"}
            </Button>
          )}
        </div>
        
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
