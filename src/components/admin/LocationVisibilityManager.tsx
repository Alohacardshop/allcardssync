import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface CachedLocation {
  location_gid: string;
  location_name: string;
  location_id: string | null;
  is_hidden: boolean;
  store_key: string;
}

export function LocationVisibilityManager() {
  const [stores, setStores] = useState<{ key: string; name: string }[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [locations, setLocations] = useState<CachedLocation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (selectedStore) loadLocations(selectedStore);
  }, [selectedStore]);

  const loadStores = async () => {
    const { data } = await supabase
      .from("shopify_stores")
      .select("key, name")
      .order("name");
    if (data) {
      setStores(data);
      if (data.length > 0) setSelectedStore(data[0].key);
    }
  };

  const loadLocations = async (storeKey: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shopify_location_cache")
      .select("location_gid, location_name, location_id, is_hidden, store_key")
      .eq("store_key", storeKey)
      .order("location_name");

    if (!error && data) {
      setLocations(data as CachedLocation[]);
    }
    setLoading(false);
  };

  const toggleVisibility = async (locationGid: string, isHidden: boolean) => {
    const { error } = await supabase
      .from("shopify_location_cache")
      .update({ is_hidden: isHidden })
      .eq("store_key", selectedStore)
      .eq("location_gid", locationGid);

    if (error) {
      toast.error("Failed to update location visibility");
      return;
    }

    setLocations(prev =>
      prev.map(loc =>
        loc.location_gid === locationGid ? { ...loc, is_hidden: isHidden } : loc
      )
    );

    const loc = locations.find(l => l.location_gid === locationGid);
    toast.success(`${loc?.location_name} is now ${isHidden ? "hidden" : "visible"}`);
  };

  const visibleCount = locations.filter(l => !l.is_hidden).length;
  const hiddenCount = locations.filter(l => l.is_hidden).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location Visibility
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control which Shopify locations are visible to staff in dropdowns and selectors.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Select store..." />
          </SelectTrigger>
          <SelectContent>
            {stores.map(store => (
              <SelectItem key={store.key} value={store.key}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedStore && (
          <div className="flex gap-2 text-sm">
            <Badge variant="outline" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {visibleCount} visible
            </Badge>
            {hiddenCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <EyeOff className="h-3 w-3" />
                {hiddenCount} hidden
              </Badge>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground py-4">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No cached locations found. Locations appear here after they're fetched from Shopify.
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map(loc => (
              <div
                key={loc.location_gid}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  loc.is_hidden ? "bg-muted/50 opacity-60" : "bg-background"
                }`}
              >
                <div className="flex items-center gap-3">
                  {loc.is_hidden ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-primary" />
                  )}
                  <div>
                    <div className={`font-medium text-sm ${loc.is_hidden ? "line-through text-muted-foreground" : ""}`}>
                      {loc.location_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: {loc.location_id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`vis-${loc.location_gid}`} className="text-xs text-muted-foreground">
                    {loc.is_hidden ? "Hidden" : "Visible"}
                  </Label>
                  <Switch
                    id={`vis-${loc.location_gid}`}
                    checked={!loc.is_hidden}
                    onCheckedChange={(checked) => toggleVisibility(loc.location_gid, !checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
