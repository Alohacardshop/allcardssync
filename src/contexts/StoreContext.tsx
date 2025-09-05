
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAssignments, setUserAssignments] = useState<any[]>([]);

  // Load user roles and assignments
  useEffect(() => {
    loadUserData();
  }, []);

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

      // Set default store/location if user has assignments
      const defaultAssignment = assignments?.find(a => a.is_default);
      if (defaultAssignment && !selectedStore) {
        setSelectedStore(defaultAssignment.store_key);
        setSelectedLocation(defaultAssignment.location_gid);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const refreshUserAssignments = async () => {
    await loadUserData();
  };

  // Load available stores
  useEffect(() => {
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

    loadStores();
  }, []);

  // Load locations when store changes
  useEffect(() => {
    const loadLocations = async () => {
      if (!selectedStore) {
        setAvailableLocations([]);
        setSelectedLocation(null);
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
          setAvailableLocations(locations);
          
          // Show specific message for 0 locations
          if (locations.length === 0) {
            toast({
              title: `No locations found for ${selectedStore}`,
              description: "Check Admin > Shopify Config > Test Connection for details.",
              variant: "default",
            });
          }
          
          // Clear selected location if it's not available in new locations
          if (selectedLocation && !locations.some(loc => loc.gid === selectedLocation)) {
            setSelectedLocation(null);
          }
        } else {
          throw new Error(data?.error || "Failed to load locations");
        }
      } catch (error) {
        console.error("Error loading locations:", error);
        setAvailableLocations([]);
        setSelectedLocation(null);
        
        // Show user-friendly error message
        const errorMessage = error instanceof Error ? error.message : "Failed to load locations";
        toast({
          title: "Failed to load locations", 
          description: errorMessage.includes("configuration not found") 
            ? "Please configure Shopify credentials in Admin > Shopify Config"
            : errorMessage,
          variant: "destructive",
        });
      } finally {
        setLoadingLocations(false);
      }
    };

    loadLocations();
  }, [selectedStore]);

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
    isAdmin,
    userAssignments,
    refreshUserAssignments,
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}
