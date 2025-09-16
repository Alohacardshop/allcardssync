import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Package, ShoppingCart, RefreshCw, Store, Lock, Layers } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { MobileBottomNav } from "@/components/navigation/MobileBottomNav";
import { GradedCardIntake } from "@/components/GradedCardIntake";
import { RawCardIntake } from "@/components/RawCardIntake";
import { CurrentBatchPanel } from "@/components/CurrentBatchPanel";
import { useStore } from "@/contexts/StoreContext";
import { PrintQueueStatus } from "@/components/PrintQueueStatus";
import { useIsMobile } from "@/hooks/use-mobile";

interface IntakeItem {
  id: string;
  card_name?: string;
  subject?: string;
  brand_title?: string;
  sku?: string;
  set_name?: string;
  card_number?: string;
  quantity: number;
  price: number;
  lot_number: string;
  processing_notes?: string;
  printed_at?: string;
  pushed_at?: string;
  game?: string;
  created_at: string;
  updated_at: string;
  removed_from_batch_at?: string;
  category?: string;
  catalog_snapshot?: any;
}

interface SystemStats {
  items_pushed: number;
}

const Index = () => {
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("graded");
  const isMobile = useIsMobile();
  
  const { 
    assignedStore, 
    selectedLocation, 
    setSelectedLocation,
    availableLocations,
    loadingLocations,
    refreshLocations
  } = useStore();

  // Auto-select Ward location as default
  useEffect(() => {
    if (availableLocations && availableLocations.length > 0 && !selectedLocation) {
      const wardLocation = availableLocations.find(l => 
        l.name?.toLowerCase().includes('ward')
      );
      if (wardLocation) {
        setSelectedLocation(wardLocation.gid);
      }
    }
  }, [availableLocations, selectedLocation, setSelectedLocation]);

  // Handle location change
  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    localStorage.setItem('selected_shopify_location', value);
    
    // Notify all components
    window.dispatchEvent(new CustomEvent('locationChanged', { 
      detail: { location: value, store: assignedStore }
    }));
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      // Build base query filters for store/location
      const baseFilters: any = { deleted_at: null };
      if (assignedStore) {
        baseFilters.store_key = assignedStore;
      }
      if (selectedLocation) {
        baseFilters.shopify_location_gid = selectedLocation;
      }

      // Get system stats - filter by store/location (exclude batch items)
      let statsQuery = supabase
        .from('intake_items')
        .select('quantity, price, printed_at, pushed_at')
        .is('deleted_at', null)
        .not('removed_from_batch_at', 'is', null);

      if (assignedStore) {
        statsQuery = statsQuery.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        statsQuery = statsQuery.eq('shopify_location_gid', selectedLocation);
      }

      const { data: stats } = await statsQuery;

      const systemStats: SystemStats = {
        items_pushed: stats?.filter(item => item.pushed_at).length || 0
      };

      setSystemStats(systemStats);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up realtime subscription for system stats updates
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intake_items'
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Listen for custom events from intake forms as backup
    const handleItemAdded = () => {
      fetchData();
    };

    window.addEventListener('intake:item-added', handleItemAdded);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('intake:item-added', handleItemAdded);
    };
  }, [assignedStore, selectedLocation]); // Re-fetch when store/location changes

  const handleBatchAdd = async () => {
    toast.success('Item added to batch');
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* Navigation */}
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <Navigation />
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      <div className="container mx-auto px-4 py-6">
        {/* TOP SECTION: Items Pushed and Store/Location side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* LEFT CARD: Items Pushed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4" />
                Items Pushed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{systemStats?.items_pushed || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">Synced to Shopify</p>
            </CardContent>
          </Card>

          {/* RIGHT CARD: Store & Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Store & Location
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={refreshLocations}
                  disabled={loadingLocations}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingLocations ? 'animate-spin' : ''}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Store Badge */}
              <div>
                <Label className="text-xs text-muted-foreground">Active Store</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">
                    {assignedStore === 'hawaii' ? 'Hawaii Store' : 
                     assignedStore === 'las_vegas' ? 'Las Vegas' : 
                     'No Store'}
                  </Badge>
                </div>
              </div>
              
              {/* Location Dropdown */}
              <div>
                <Label className="text-xs text-muted-foreground">Location</Label>
                <Select 
                  value={selectedLocation || ''} 
                  onValueChange={handleLocationChange}
                  disabled={loadingLocations}
                >
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue>
                      {loadingLocations ? 'Loading...' :
                       !selectedLocation ? 'Select location' :
                       availableLocations?.find(l => l.gid === selectedLocation)?.name || 'Selected'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableLocations?.map((location) => (
                      <SelectItem key={location.gid} value={location.gid}>
                        {location.name}
                        {location.name?.toLowerCase().includes('ward') && 
                          <span className="ml-2 text-xs text-muted-foreground">(Default)</span>
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Print Queue Status */}
        <div className="mb-6">
          <PrintQueueStatus />
        </div>

        {/* TAB NAVIGATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
            <GradedCardIntake onBatchAdd={handleBatchAdd} />
          </TabsContent>
          
          <TabsContent value="raw" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Raw Cards Intake</CardTitle>
                <CardDescription>Add raw (ungraded) cards to inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <RawCardIntake 
                  onBatchAdd={handleBatchAdd}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="batch" className="mt-4">
            <CurrentBatchPanel onViewFullBatch={() => setActiveTab("batch")} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;