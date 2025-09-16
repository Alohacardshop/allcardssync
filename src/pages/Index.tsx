import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Store as StoreIcon, ShoppingCart, Lock, Package, Layers } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { supabase } from '@/lib/supabase';
import GradedCardIntake from '@/components/GradedCardIntake';
import RawCardIntake from '@/components/RawCardIntake';
import CurrentBatchPanel from '@/components/CurrentBatchPanel';

export default function Index() {
  // Get all store context values
  const storeContext = useStore();
  
  // Extract what we need - handle both possible naming conventions
  const assignedStore = storeContext.assignedStore;
  const selectedLocation = storeContext.selectedLocation;
  const setSelectedLocation = storeContext.setSelectedLocation;
  const isLoadingLocations = storeContext.isLoadingLocations || false;
  const refreshLocations = storeContext.refreshLocations;
  
  // Handle different possible names for locations array
  const locations = storeContext.availableLocations || 
                   storeContext.locations || 
                   [];

  const [activeTab, setActiveTab] = useState('graded');
  const [itemsPushed, setItemsPushed] = useState(0);

  // Fetch items pushed count
  useEffect(() => {
    const fetchItemsPushed = async () => {
      try {
        const { count, error } = await supabase
          .from('inventory_items')
          .select('*', { count: 'exact', head: true })
          .eq('pushed_to_shopify', true);
        
        if (!error) {
          setItemsPushed(count || 0);
        }
      } catch (err) {
        console.error('Error fetching items pushed:', err);
      }
    };
    
    fetchItemsPushed();
  }, []);

  // Auto-select Ward location as default
  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLocation) {
      const wardLocation = locations.find(loc => 
        loc.name && loc.name.toLowerCase().includes('ward')
      );
      
      if (wardLocation && wardLocation.gid) {
        setSelectedLocation(wardLocation.gid);
      } else if (locations[0] && locations[0].gid) {
        // Fallback to first location if Ward not found
        setSelectedLocation(locations[0].gid);
      }
    }
  }, [locations, selectedLocation, setSelectedLocation]);

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
    if (isLoadingLocations) return 'Loading locations...';
    if (!selectedLocation) return 'Select a location';
    
    const location = locations.find(loc => loc.gid === selectedLocation);
    if (location && location.name) {
      return location.name;
    }
    
    // Fallback - show the GID if name not found
    return selectedLocation;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        
        {/* TOP SECTION: Two cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          
          {/* LEFT CARD: Items Pushed */}
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5" />
                Items Pushed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{itemsPushed}</div>
              <p className="text-sm text-muted-foreground mt-1">Synced to Shopify</p>
            </CardContent>
          </Card>

          {/* RIGHT CARD: Store & Location */}
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-5 w-5" />
                  Store & Location
                </div>
                {refreshLocations && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={refreshLocations}
                    disabled={isLoadingLocations}
                    className="h-8 w-8"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingLocations ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Store Display */}
              <div>
                <Label className="text-xs text-muted-foreground">Active Store</Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="text-sm font-medium">
                    {assignedStore === 'hawaii' ? 'Hawaii Store' : 
                     assignedStore === 'las_vegas' ? 'Las Vegas Store' : 
                     assignedStore || 'No Store Assigned'}
                  </Badge>
                </div>
              </div>

              {/* Location Selector */}
              {assignedStore && (
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <Select
                    value={selectedLocation || ''}
                    onValueChange={handleLocationChange}
                    disabled={isLoadingLocations || locations.length === 0}
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue>
                        {getLocationName()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
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
                  
                  {/* Warning if no location selected */}
                  {!selectedLocation && !isLoadingLocations && locations.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      Please select a location to continue
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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