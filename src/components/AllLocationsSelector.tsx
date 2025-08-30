import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LocationOption {
  gid: string;
  name: string;
  storeName: string;
  storeKey: string;
  displayName: string;
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
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
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
                  displayName: `${store.name} - ${loc.name}`
                }));
                allLocations.push(...storeLocations);
              }
            } catch (error) {
              console.error(`Error loading locations for store ${store.key}:`, error);
            }
          }

          setLocations(allLocations);
        } else {
          // Non-admin users can only access assigned locations
          const { data: assignments } = await supabase
            .from("user_shopify_assignments")
            .select(`
              store_key, 
              location_gid, 
              location_name,
              shopify_stores!inner(name)
            `)
            .eq("user_id", user.id);

          if (assignments) {
            const userLocations = assignments.map((assignment: any) => ({
              gid: assignment.location_gid,
              name: assignment.location_name,
              storeName: assignment.shopify_stores.name,
              storeKey: assignment.store_key,
              displayName: `${assignment.shopify_stores.name} - ${assignment.location_name}`
            }));
            setLocations(userLocations);
          }
        }
      } catch (error) {
        console.error("Error loading accessible locations:", error);
        toast({
          title: "Failed to load locations",
          description: "Could not load your accessible locations. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadAllAccessibleLocations();
  }, []);

  const handleValueChange = (selectedValue: string) => {
    const newValue = selectedValue === "all" ? null : selectedValue;
    onValueChange?.(newValue);
  };

  return (
    <div className={className}>
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
              {location.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}