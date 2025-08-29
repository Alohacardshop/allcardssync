import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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

    loadUserData();
  }, []);

  // Load available stores
  useEffect(() => {
    const loadStores = async () => {
      try {
        const { data } = await supabase
          .from("shopify_stores")
          .select("key, name, vendor")
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
        return;
      }

      setLoadingLocations(true);
      try {
        const { data, error } = await supabase.functions.invoke("shopify-locations", {
          body: { storeKey: selectedStore }
        });
        
        if (error) throw error;
        
        if (data?.ok && data?.locations) {
          setAvailableLocations(data.locations.map((loc: any) => ({
            id: String(loc.id),
            name: loc.name,
            gid: `gid://shopify/Location/${loc.id}`
          })));
        }
      } catch (error) {
        console.error("Error loading locations:", error);
        setAvailableLocations([]);
      } finally {
        setLoadingLocations(false);
      }
    };

    loadLocations();
  }, [selectedStore]);

  const contextValue: StoreContextType = {
    selectedStore,
    setSelectedStore,
    availableStores: isAdmin ? availableStores : availableStores.filter(store => 
      userAssignments.some(assignment => assignment.store_key === store.key)
    ),
    selectedLocation,
    setSelectedLocation,
    availableLocations: isAdmin ? availableLocations : availableLocations.filter(location => 
      userAssignments.some(assignment => assignment.location_gid === location.gid)
    ),
    loadingLocations,
    isAdmin,
    userAssignments,
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}