
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
  // Auto-assigned store (single store per user)
  assignedStore: string | null;
  assignedStoreName: string | null;
  
  // Location management
  selectedLocation: string | null;
  setSelectedLocation: (locationGid: string | null) => void;
  availableLocations: Location[];
  loadingLocations: boolean;
  locationsLastUpdated: Date | null;
  
  // User access
  isAdmin: boolean;
  isStaff: boolean;
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
  const [assignedStore, setAssignedStore] = useState<string | null>(null);
  const [assignedStoreName, setAssignedStoreName] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationsLastUpdated, setLocationsLastUpdated] = useState<Date | null>(null);
  const [locationsCache, setLocationsCache] = useState<Record<string, Location[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [userAssignments, setUserAssignments] = useState<any[]>([]);

  // Load user roles and assignments
  useEffect(() => {
    loadUserData();
  }, []);

  // Auto-load locations for a specific store (silent, no toast messages)
  const autoLoadLocations = async (storeKey: string): Promise<Location[] | null> => {
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
        return locations;
      }
      return null;
    } catch (error) {
      console.error("Error auto-loading locations:", error);
      // Silent failure - user can manually refresh if needed
      return null;
    }
  };

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("StoreContext: No user found");
        return;
      }

      console.log("StoreContext: Loading user data for user:", user.id);

      // Check if user is admin or staff
      const { data: adminCheck } = await supabase.rpc("has_role", { 
        _user_id: user.id, 
        _role: "admin" 
      });
      setIsAdmin(adminCheck || false);

      const { data: staffCheck } = await supabase.rpc("has_role", { 
        _user_id: user.id, 
        _role: "staff" 
      });
      setIsStaff(staffCheck || false);

      // Load user assignments with fresh data
      const { data: assignments, error: assignmentsError } = await supabase
        .from("user_shopify_assignments")
        .select("store_key, location_gid, location_name, is_default")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false }); // Put defaults first
      
      if (assignmentsError) {
        console.error("StoreContext: Error loading assignments:", assignmentsError);
        return;
      }

      console.log("StoreContext: Loaded assignments:", assignments);
      setUserAssignments(assignments || []);

      // Auto-assign to user's single store (with new constraint, users can only have one store)
      if (assignments && assignments.length > 0) {
        const userAssignment = assignments[0]; // Should only be one store now
        console.log("StoreContext: Auto-assigning to user's store:", userAssignment);
        
        // Get store name from database
        const { data: storeData, error: storeError } = await supabase
          .from("shopify_stores")
          .select("name")
          .eq("key", userAssignment.store_key)
          .maybeSingle();
          
        if (storeError) {
          console.error("Error fetching store data:", storeError);
          // Don't show toast error here as it might be called too early
        }
        
        setAssignedStore(userAssignment.store_key);
        setAssignedStoreName(storeData?.name || userAssignment.store_key);
        
        // Auto-load locations for the assigned store
        const loadedLocs = await autoLoadLocations(userAssignment.store_key);
        
        // Set default location or first available
        const defaultAssignment = assignments.find(a => a.is_default);
        const locationToSelect = defaultAssignment?.location_gid || assignments[0].location_gid;
        setSelectedLocation(locationToSelect);
        
        const locationDisplayName = defaultAssignment?.location_name 
          || loadedLocs?.find(l => l.gid === locationToSelect)?.name 
          || "your location";
        
        toast({
          title: "Store loaded",
          description: `Using ${storeData?.name || userAssignment.store_key} - ${locationDisplayName}`,
          variant: "default",
        });
      } else {
        console.log("StoreContext: No assignments found");
        toast({
          title: "No store access",
          description: "Please contact an administrator to assign you to a store",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      toast({
        title: "Failed to load user data",
        description: "Please try refreshing the page",
        variant: "destructive",
      });
    }
  };

  const refreshUserAssignments = async () => {
    await loadUserData();
  };

  // No need to load all stores anymore - users are auto-assigned to their single store

  // Refresh data when auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadUserData();
      }
      if (event === "SIGNED_OUT") {
        setAssignedStore(null);
        setAssignedStoreName(null);
        setSelectedLocation(null);
        setAvailableLocations([]);
        setUserAssignments([]);
        setIsAdmin(false);
        setIsStaff(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load cached locations when assigned store changes (no automatic refresh)
  useEffect(() => {
    if (!assignedStore) {
      setAvailableLocations([]);
      setSelectedLocation(null);
      return;
    }

    // Use cached locations if available
    const cached = locationsCache[assignedStore];
    if (cached) {
      setAvailableLocations(cached);
      
      // Only clear selected location if it's not available in cached locations AND
      // we're not loading default user data (which sets location after loading locations)
      if (selectedLocation && !cached.some(loc => loc.gid === selectedLocation)) {
        // Check if this might be a default location that's valid but not yet loaded
        const hasMatchingAssignment = userAssignments.some(
          a => a.store_key === assignedStore && a.location_gid === selectedLocation
        );
        
        // Only clear if we don't have a matching assignment
        if (!hasMatchingAssignment) {
          setSelectedLocation(null);
        }
      }
    } else {
      // No cache, start with empty locations (user needs to refresh manually)
      setAvailableLocations([]);
      // Don't clear selectedLocation here if user assignments indicate it should be valid
      const hasMatchingAssignment = userAssignments.some(
        a => a.store_key === assignedStore && a.location_gid === selectedLocation
      );
      
      if (!hasMatchingAssignment) {
        setSelectedLocation(null);
      }
    }
  }, [assignedStore, locationsCache, userAssignments]); // Removed selectedLocation from deps to prevent loop

  // Manual location refresh function
  const refreshLocations = async () => {
    if (!assignedStore) {
      toast({
        title: "No store assigned",
        description: "Please contact an administrator to assign you to a store",
        variant: "destructive",
      });
      return;
    }

    setLoadingLocations(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey: assignedStore }
      });
      
      if (error) throw error;
      
      if (data?.ok) {
        const locations = (data.locations || []).map((loc: any) => ({
          id: String(loc.id),
          name: loc.name,
          gid: `gid://shopify/Location/${loc.id}`
        }));
        
        // Update cache and available locations
        setLocationsCache(prev => ({ ...prev, [assignedStore]: locations }));
        setAvailableLocations(locations);
        setLocationsLastUpdated(new Date());
        
        // Show success message
        toast({
          title: "Locations refreshed",
          description: `Found ${locations.length} location${locations.length !== 1 ? 's' : ''} for ${assignedStoreName || assignedStore}`,
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
    assignedStore,
    assignedStoreName,
    selectedLocation,
    setSelectedLocation,
    // Show locations filtered by assignments for non-admins/non-staff
    availableLocations: (isAdmin || isStaff)
      ? availableLocations 
      : availableLocations.filter(loc => 
          userAssignments.some(a => a.store_key === assignedStore && a.location_gid === loc.gid)
        ),
    loadingLocations,
    locationsLastUpdated,
    isAdmin,
    isStaff,
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
