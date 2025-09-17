import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Store as StoreIcon, ShoppingCart, MapPin, Package } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/integrations/supabase/client';

export function NavigationBar() {
  const { 
    assignedStore, 
    selectedLocation, 
    setSelectedLocation,
    availableLocations = [],
    loadingLocations,
    refreshLocations
  } = useStore();
  
  const [itemsPushed, setItemsPushed] = useState(0);

  // Fetch items pushed count
  useEffect(() => {
    const fetchItemsPushed = async () => {
      try {
        // Simple fallback for items count
        setItemsPushed(0);
      } catch (err) {
        console.error('Error fetching items pushed:', err);
        setItemsPushed(0);
      }
    };
    
    fetchItemsPushed();
  }, []);

  // Auto-select Ward location as default and persist location
  useEffect(() => {
    // First try to recover from localStorage
    const savedLocation = localStorage.getItem('selected_shopify_location');
    
    if (savedLocation && availableLocations.some(loc => loc.gid === savedLocation) && !selectedLocation) {
      setSelectedLocation(savedLocation);
      return;
    }

    // Auto-select Ward location if no saved location or saved location not available
    if (availableLocations && availableLocations.length > 0 && !selectedLocation) {
      const wardLocation = availableLocations.find(loc => 
        loc.name && loc.name.toLowerCase().includes('ward')
      );
      
      if (wardLocation && wardLocation.gid) {
        setSelectedLocation(wardLocation.gid);
        localStorage.setItem('selected_shopify_location', wardLocation.gid);
      } else if (availableLocations[0] && availableLocations[0].gid) {
        // Fallback to first location if Ward not found
        setSelectedLocation(availableLocations[0].gid);
        localStorage.setItem('selected_shopify_location', availableLocations[0].gid);
      }
    }
  }, [availableLocations, selectedLocation, setSelectedLocation]);

  const handleLocationChange = (value: string) => {
    if (setSelectedLocation) {
      setSelectedLocation(value);
      localStorage.setItem('selected_shopify_location', value);
      
      // Notify other components of the change
      window.dispatchEvent(new CustomEvent('locationChanged', { 
        detail: { location: value, store: assignedStore }
      }));
    }
  };

  // Helper to get location name from GID
  const getLocationName = () => {
    if (loadingLocations) return 'Loading locations...';
    if (!selectedLocation) return 'Select a location';
    
    const location = availableLocations.find(loc => loc.gid === selectedLocation);
    if (location && location.name) {
      return location.name;
    }
    
    // Fallback - show the GID if name not found
    return selectedLocation;
  };

  const getStoreName = () => {
    if (assignedStore === 'hawaii') return 'Hawaii Store';
    if (assignedStore === 'las_vegas') return 'Las Vegas Store';
    return assignedStore || 'No Store Assigned';
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card border-b shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          
          {/* LEFT SIDE - Logo/Title */}
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Inventory Management</h1>
          </div>

          {/* RIGHT SIDE - Store Controls & Info */}
          <div className="flex items-center gap-4">
            
            {/* Items Pushed Counter */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{itemsPushed}</span>
              <span className="text-xs text-muted-foreground">pushed</span>
            </div>

            {/* Store Badge */}
            {assignedStore && (
              <Badge variant="secondary" className="text-sm font-medium">
                <StoreIcon className="h-3 w-3 mr-1" />
                {getStoreName()}
              </Badge>
            )}

            {/* Location Selector */}
            {assignedStore && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedLocation || ''}
                  onValueChange={handleLocationChange}
                  disabled={loadingLocations || availableLocations.length === 0}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue>
                      {getLocationName()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableLocations.map((location) => (
                      <SelectItem key={location.gid} value={location.gid}>
                        <div className="flex items-center gap-2">
                          <span>{location.name}</span>
                          {location.name && location.name.toLowerCase().includes('ward') && (
                            <Badge variant="outline" className="text-xs">Default</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Refresh Button */}
                {refreshLocations && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={refreshLocations}
                    disabled={loadingLocations}
                    className="h-8 w-8"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingLocations ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            )}

            {/* Warning if no store/location */}
            {!assignedStore && (
              <Badge variant="destructive" className="text-xs">
                No Store Assigned
              </Badge>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}