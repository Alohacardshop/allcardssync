import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Store as StoreIcon, ShoppingCart, Lock, Package, Layers } from 'lucide-react';
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

  // Fetch items pushed
  useEffect(() => {
    const fetchItemsPushed = async () => {
      try {
        const { count } = await supabase
          .from('intake_items')
          .select('*', { count: 'exact', head: true })
          .not('pushed_at', 'is', null);
        
        setItemsPushed(count || 0);
      } catch (error) {
        console.error('Error fetching items pushed:', error);
      }
    };
    
    fetchItemsPushed();
  }, []);

  // Auto-select Ward location
  useEffect(() => {
    if (availableLocations && availableLocations.length > 0 && !selectedLocation) {
      const wardLocation = availableLocations.find(l => 
        l.name?.toLowerCase().includes('ward')
      );
      if (wardLocation) {
        setSelectedLocation(wardLocation.gid);
      } else if (availableLocations[0]) {
        setSelectedLocation(availableLocations[0].gid);
      }
    }
  }, [availableLocations, selectedLocation, setSelectedLocation]);

  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    localStorage.setItem('selected_shopify_location', value);
    window.dispatchEvent(new CustomEvent('locationChanged', { 
      detail: { location: value, store: assignedStore }
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        
        {/* HEADER SECTION WITH TWO CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          
          {/* ITEMS PUSHED CARD */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Items Pushed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{itemsPushed}</div>
              <p className="text-sm text-muted-foreground">Synced to Shopify</p>
            </CardContent>
          </Card>

          {/* STORE & LOCATION CARD */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-5 w-5" />
                  Store & Location
                </div>
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
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Store Display */}
              <div>
                <Label htmlFor="store" className="text-xs text-muted-foreground">
                  Active Store
                </Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="text-sm">
                    {assignedStore === 'hawaii' ? 'Hawaii Store' : 
                     assignedStore === 'las_vegas' ? 'Las Vegas Store' : 
                     assignedStore || 'No Store Assigned'}
                  </Badge>
                </div>
              </div>

              {/* Location Selector */}
              {assignedStore && (
                <div>
                  <Label htmlFor="location" className="text-xs text-muted-foreground">
                    Location
                  </Label>
                  <Select
                    value={selectedLocation || ''}
                    onValueChange={handleLocationChange}
                    disabled={loadingLocations || availableLocations.length === 0}
                  >
                    <SelectTrigger id="location" className="w-full mt-1">
                      <SelectValue>
                        {loadingLocations ? 'Loading locations...' :
                         availableLocations.length === 0 ? 'No locations available' :
                         !selectedLocation ? 'Select a location' :
                         availableLocations.find(l => l.gid === selectedLocation)?.name || 'Selected'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableLocations.map((location) => (
                        <SelectItem key={location.gid} value={location.gid}>
                          <div className="flex items-center gap-2">
                            {location.name}
                            {location.name?.toLowerCase().includes('ward') && (
                              <Badge variant="outline" className="text-xs">Default</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* TAB NAVIGATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="graded">
              <Lock className="h-4 w-4 mr-2" />
              Graded
            </TabsTrigger>
            <TabsTrigger value="raw">
              <Package className="h-4 w-4 mr-2" />
              Raw
            </TabsTrigger>
            <TabsTrigger value="batch">
              <Layers className="h-4 w-4 mr-2" />
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