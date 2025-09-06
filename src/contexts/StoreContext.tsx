
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Store {
  key: string;
  name: string;
  vendor: string;
}

interface Location {
  id: string;
  name: string;
  gid: string;
}

interface StoreContextType {
  // Store management
  selectedStore: string | null;
  setSelectedStore: (storeKey: string | null) => void;
  availableStores: Store[];
  
  // Location management
  selectedLocation: string | null;
  setSelectedLocation: (locationGid: string | null) => void;
  availableLocations: Location[];
  loadingLocations: boolean;
  locationsLastUpdated: Date | null;
  
  // User access
  isAdmin: boolean;
  userAssignments: Array<{
    store_key: string;
    location_gid: string;
    location_name: string;
    is_default: boolean;
  }>;
  
  // Actions
  refreshUserAssignments: () => Promise<void>;
  refreshLocations: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [availableStores, setAvailableStores] = useState<Store[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationsLastUpdated, setLocationsLastUpdated] = useState<Date | null>(null);
  const [locationsCache, setLocationsCache] = useState<Record<string, Location[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAssignments, setUserAssignments] = useState<any[]>([]);

  // Load user roles and assignments
  useEffect(() => {
    loadUserData();
  }, []);

  // Auto-load locations for a specific store (silent, no toast messages)
  const autoLoadLocations = async (storeKey: string) => {
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
        
        // Update cache and available locations
        setLocationsCache(prev => ({ ...prev, [storeKey]: locations }));
        setAvailableLocations(locations);
        setLocationsLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error auto-loading locations:", error);
      // Silent failure - user can manually refresh if needed
    }
  };

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: adminCheck } = await supabase.rpc("has_role", { 
        _user_id: user.id, 
        _role: "admin" 
      });
      setIsAdmin(adminCheck || false);

      // Load user assignments
      const { data: assignments } = await supabase
        .from("user_shopify_assignments")
        .select("store_key, location_gid, location_name, is_default")
        .eq("user_id", user.id);
      
      setUserAssignments(assignments || []);

      // Set default store/location from user assignments
      const defaultAssignment = assignments?.find(a => a.is_default);
      if (defaultAssignment) {
        setSelectedStore(defaultAssignment.store_key);
        setSelectedLocation(defaultAssignment.location_gid);
        
        // Auto-load locations for the default store
        await autoLoadLocations(defaultAssignment.store_key);
      } else if (assignments && assignments.length > 0) {
        // If no default, use the first assignment
        const firstAssignment = assignments[0];
        setSelectedStore(firstAssignment.store_key);
        setSelectedLocation(firstAssignment.location_gid);
        
        // Auto-load locations for the selected store
        await autoLoadLocations(firstAssignment.store_key);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const refreshUserAssignments = async () => {
    await loadUserData();
  };

  // Load available stores function
  const loadStores = async () => {
    try {
      const { data } = await supabase
        .from("shopify_stores")
        .select("key, name, vendor")
        .eq("vendor", "Aloha Card Shop")  // Safety filter to only show Aloha Card Shop stores
        .order("name");
      
      setAvailableStores(data || []);
    } catch (error) {
      console.error("Error loading stores:", error);
    }
  };

  // Load stores on mount
  useEffect(() => {
    loadStores();
  }, []);

  // Refresh data when auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadUserData();
        loadStores();
      }
      if (event === "SIGNED_OUT") {
        setSelectedStore(null);
        setSelectedLocation(null);
        setAvailableStores([]);
        setAvailableLocations([]);
        setUserAssignments([]);
        setIsAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load cached locations when store changes (no automatic refresh)
  useEffect(() => {
    if (!selectedStore) {
      setAvailableLocations([]);
      setSelectedLocation(null);
      return;
    }

    // Use cached locations if available
    const cached = locationsCache[selectedStore];
    if (cached) {
      setAvailableLocations(cached);
      
      // Clear selected location if it's not available in cached locations
      if (selectedLocation && !cached.some(loc => loc.gid === selectedLocation)) {
        setSelectedLocation(null);
      }
    } else {
      // No cache, start with empty locations (user needs to refresh manually)
      setAvailableLocations([]);
      setSelectedLocation(null);
    }
  }, [selectedStore, locationsCache, selectedLocation]);

  // Manual location refresh function
  const refreshLocations = async () => {
    if (!selectedStore) {
      toast({
        title: "No store selected",
        description: "Please select a store first",
        variant: "destructive",
      });
      return;
    }

    setLoadingLocations(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey: selectedStore }
      });
      
      if (error) throw error;
      
      if (data?.ok) {
        const locations = (data.locations || []).map((loc: any) => ({
          id: String(loc.id),
          name: loc.name,
          gid: `gid://shopify/Location/${loc.id}`
        }));
        
        // Update cache and available locations
        setLocationsCache(prev => ({ ...prev, [selectedStore]: locations }));
        setAvailableLocations(locations);
        setLocationsLastUpdated(new Date());
        
        // Show success message
        toast({
          title: "Locations refreshed",
          description: `Found ${locations.length} location${locations.length !== 1 ? 's' : ''} for ${selectedStore}`,
          variant: "default",
        });
        
        // Clear selected location if it's not available in new locations
        if (selectedLocation && !locations.some(loc => loc.gid === selectedLocation)) {
          setSelectedLocation(null);
        }
      } else {
        throw new Error(data?.error || "Failed to load locations");
      }
    } catch (error) {
      console.error("Error loading locations:", error);
      
      // Don't clear existing locations on error, just show error message
      const errorMessage = error instanceof Error ? error.message : "Failed to load locations";
      toast({
        title: "Failed to refresh locations", 
        description: errorMessage.includes("configuration not found") 
          ? "Please configure Shopify credentials in Admin > Shopify Config"
          : errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingLocations(false);
    }
  };

  const contextValue: StoreContextType = {
    selectedStore,
    setSelectedStore,
    // Show all stores to admins, or only assigned stores to regular users
    availableStores: isAdmin ? availableStores : availableStores.filter(store => 
      userAssignments.some(assignment => assignment.store_key === store.key)
    ),
    selectedLocation,
    setSelectedLocation,
    // Show locations filtered by assignments for non-admins
    availableLocations: isAdmin 
      ? availableLocations 
      : availableLocations.filter(loc => 
          userAssignments.some(a => a.store_key === selectedStore && a.location_gid === loc.gid)
        ),
    loadingLocations,
    locationsLastUpdated,
    isAdmin,
    userAssignments,
    refreshUserAssignments,
    refreshLocations,
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}
