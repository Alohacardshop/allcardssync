import React, { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/contexts/StoreContext";
import { Store, MapPin, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface StoreLocationSelectorAutoProps {
  className?: string;
  showSetDefault?: boolean;
}

export function StoreLocationSelectorAuto({ className, showSetDefault = true }: StoreLocationSelectorAutoProps) {
  const { 
    assignedStore, 
    assignedStoreName,
    selectedLocation, 
    availableLocations,
    loadingLocations,
    isAdmin,
    userAssignments 
  } = useStore();

  // Get the selected location name safely
  const selectedLocationData = availableLocations?.find(l => l.gid === selectedLocation);
  const selectedLocationName = selectedLocationData?.name || "Loading...";

  // Auto-select default location if none selected
  useEffect(() => {
    if (!loadingLocations && availableLocations?.length > 0 && !selectedLocation) {
      // Find default location from assignments
      const defaultAssignment = userAssignments?.find(
        assignment => assignment.store_key === assignedStore && assignment.is_default
      );
      
      if (defaultAssignment) {
        // Default assignment found, but it might not be in available locations
        const isLocationAvailable = availableLocations.some(l => l.gid === defaultAssignment.location_gid);
        if (isLocationAvailable) {
          // Auto-select the default location (this would be handled by StoreContext)
          console.log("Auto-selected default location:", defaultAssignment.location_gid);
        }
      }
    }
  }, [assignedStore, selectedLocation, availableLocations, loadingLocations, userAssignments]);

  // Show error state if no store assigned
  if (!assignedStore) {
    return (
      <Card className={`${className} border-destructive`}>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Label className="text-base font-semibold flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Store Assignment Required
            </Label>
            <p className="text-sm text-muted-foreground">
              {isAdmin 
                ? "Please assign yourself to a store in the admin panel."
                : "Please contact an administrator to assign you to a store and location."
              }
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state
  if (loadingLocations) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Store className="h-4 w-4" />
              Store & Location
            </Label>
            <div className="flex items-center gap-2">
              <div className="animate-pulse bg-muted h-4 w-32 rounded"></div>
              <div className="animate-pulse bg-muted h-4 w-24 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Store className="h-4 w-4" />
            Store & Location
          </Label>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {assignedStoreName || assignedStore}
              </span>
              <Badge variant="secondary" className="text-xs">
                Auto-assigned
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {selectedLocationName}
              </span>
              {selectedLocation && (
                <Badge variant="outline" className="text-xs">
                  Active
                </Badge>
              )}
            </div>

            {!selectedLocation && availableLocations?.length === 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">No locations available for this store</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Wrap in error boundary
export function StoreLocationSelectorAutoWrapper(props: StoreLocationSelectorAutoProps) {
  return (
    <ErrorBoundary
      fallback={
        <Card className={`${props.className} border-destructive`}>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-semibold flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                Store Selection Error
              </Label>
              <p className="text-sm text-muted-foreground">
                Unable to load store and location information. Please refresh the page.
              </p>
            </div>
          </CardContent>
        </Card>
      }
    >
      <StoreLocationSelectorAuto {...props} />
    </ErrorBoundary>
  );
}