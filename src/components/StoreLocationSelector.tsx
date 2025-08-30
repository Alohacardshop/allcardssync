
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StoreSelector } from "./StoreSelector";
import { LocationSelector } from "./LocationSelector";
import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Store, Star } from "lucide-react";

interface StoreLocationSelectorProps {
  className?: string;
  showSetDefault?: boolean;
}

export function StoreLocationSelector({ className, showSetDefault = true }: StoreLocationSelectorProps) {
  const { 
    selectedStore, 
    selectedLocation, 
    availableStores, 
    availableLocations,
    userAssignments 
  } = useStore();

  const hasMultipleOptions = availableStores.length > 1 || availableLocations.length > 1;
  const isCurrentDefault = userAssignments.some(
    assignment => 
      assignment.store_key === selectedStore && 
      assignment.location_gid === selectedLocation && 
      assignment.is_default
  );

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
      // Reload the page to refresh user assignments
      window.location.reload();
    } catch (error) {
      console.error("Failed to set default:", error);
      toast.error("Failed to set default location");
    }
  };

  if (!hasMultipleOptions && !showSetDefault) {
    return null;
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Store & Location</Label>
            {isCurrentDefault && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                Current Default
              </Badge>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                <Store className="h-4 w-4 inline mr-1" />
                Store
              </Label>
              <StoreSelector />
            </div>
            
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                <MapPin className="h-4 w-4 inline mr-1" />
                Location
              </Label>
              <LocationSelector />
            </div>
          </div>

          {showSetDefault && selectedStore && selectedLocation && !isCurrentDefault && (
            <div className="pt-2 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSetDefault}
                className="flex items-center gap-2"
              >
                <Star className="h-4 w-4" />
                Set as Default
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
