import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Store as StoreIcon, ShoppingCart, Lock, Package, Layers, MapPin } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/integrations/supabase/client';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { RawCardIntake } from '@/components/RawCardIntake';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';

export default function Index() {
  const { 
    assignedStore, 
    selectedLocation, 
    setSelectedLocation,
    availableLocations = [],
    loadingLocations,
    refreshLocations
  } = useStore();
  
  const [activeTab, setActiveTab] = useState('graded');
  const [itemsPushed, setItemsPushed] = useState(0);

  // Fetch items pushed count
  useEffect(() => {
    const fetchItemsPushed = async () => {
      try {
        // Simple fallback for items count
        setItemsPushed(0);
      } catch (err) {
        console.error('Error fetching items pushed:', err);
      }
    };
    
    fetchItemsPushed();
  }, []);

  // Auto-select Ward location as default
  useEffect(() => {
    if (availableLocations && availableLocations.length > 0 && !selectedLocation) {
      const wardLocation = availableLocations.find(loc => 
        loc.name && loc.name.toLowerCase().includes('ward')
      );
      
      if (wardLocation && wardLocation.gid) {
        setSelectedLocation(wardLocation.gid);
      } else if (availableLocations[0] && availableLocations[0].gid) {
        // Fallback to first location if Ward not found
        setSelectedLocation(availableLocations[0].gid);
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

  return (
    <div className="min-h-screen bg-background">
      {/* TOP NAVIGATION BAR */}
      <nav className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            
            {/* LEFT SIDE - App Title */}
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Inventory Management</h1>
            </div>

            {/* RIGHT SIDE - Store Controls */}
            <div className="flex items-center gap-4">
              
              {/* Items Pushed Counter */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{itemsPushed}</span>
                <span className="text-xs text-muted-foreground">pushed</span>
              </div>

              {/* Store Badge */}
              {assignedStore && (
                <Badge variant="secondary" className="text-sm">
                  <StoreIcon className="h-3 w-3 mr-1" />
                  {assignedStore === 'hawaii' ? 'Hawaii Store' : 
                   assignedStore === 'las_vegas' ? 'Las Vegas Store' : 
                   assignedStore}
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
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="container mx-auto p-4">
        {/* TAB NAVIGATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="graded" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Graded
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Raw
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Batch
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="graded" className="mt-4">
            <GradedCardIntake />
          </TabsContent>
          
          <TabsContent value="raw" className="mt-4">
            <RawCardIntake />
          </TabsContent>
          
          <TabsContent value="batch" className="mt-4">
            <CurrentBatchPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}