import React, { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/contexts/StoreContext";
import { Store, MapPin, AlertCircle, RefreshCw } from "lucide-react";
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
    userAssignments,
    refreshLocations
  } = useStore();

  // Get the selected location name safely with better fallback
  const selectedLocationData = availableLocations?.find(l => l.gid === selectedLocation);
  const selectedLocationName = selectedLocationData?.name || 
    (loadingLocations ? "Loading locations..." : 
     (availableLocations?.length === 0 ? "No locations available" : 
      (selectedLocation ? "Unknown location" : "No location selected")));

  // Auto-load locations and set default location if needed
  useEffect(() => {
    if (assignedStore && !loadingLocations && availableLocations?.length === 0) {
      // Try to refresh locations if we have a store but no locations
      console.log('[StoreLocationSelectorAuto] No locations available, triggering refresh for store:', assignedStore);
      refreshLocations();
    }
    
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
          console.log("[StoreLocationSelectorAuto] Default location available:", defaultAssignment.location_gid);
        } else {
          console.log("[StoreLocationSelectorAuto] Default location not in available locations:", defaultAssignment.location_gid, availableLocations.map(l => l.gid));
        }
      } else if (availableLocations.length > 0) {
        // No default but we have locations available
        console.log("[StoreLocationSelectorAuto] No default assignment, available locations:", availableLocations.length);
      }
    }
  }, [assignedStore, selectedLocation, availableLocations, loadingLocations, userAssignments, refreshLocations]);

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
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Store className="h-4 w-4" />
                Store & Location
              </Label>
              {assignedStore && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshLocations}
                  disabled={loadingLocations}
                  className="h-7 px-2"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          
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
              {selectedLocation && selectedLocationData && (
                <Badge variant="outline" className="text-xs">
                  Active
                </Badge>
              )}
              {!selectedLocation && !loadingLocations && availableLocations?.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  None Selected
                </Badge>
              )}
            </div>

            {!selectedLocation && availableLocations?.length === 0 && !loadingLocations && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">No locations available for this store</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshLocations}
                  className="h-6 px-2 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
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