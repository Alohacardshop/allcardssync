import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ArrowRightLeft, Loader2, Settings, MapPin, Package, History, AlertCircle
} from 'lucide-react';
import { EbayLocationPriority } from '@/components/admin/EbayLocationPriority';
import { EbayAggregatePreview } from '@/components/admin/EbayAggregatePreview';
import { EbaySyncControls } from '@/components/admin/EbaySyncControls';
import { EbaySyncLog } from '@/components/admin/EbaySyncLog';
import { useStore } from '@/contexts/StoreContext';

interface EbayStoreConfig {
  id: string;
  store_key: string;
  location_key: string | null;
  environment: 'sandbox' | 'production';
  sync_enabled: boolean;
  dry_run_mode: boolean;
  sync_mode: string;
}

export default function EbaySyncDashboard() {
  const { assignedStore, assignedStoreName, isAdmin } = useStore();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<EbayStoreConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EbayStoreConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (assignedStore) {
      loadConfigs();
    }
  }, [assignedStore]);

  const loadConfigs = async () => {
    try {
      // Build query - filter by user's location unless admin
      let query = supabase
        .from('ebay_store_config')
        .select('id, store_key, location_key, environment, sync_enabled, dry_run_mode, sync_mode')
        .order('created_at', { ascending: false });
      
      // Non-admins only see configs for their assigned store
      if (!isAdmin && assignedStore) {
        query = query.eq('location_key', assignedStore);
      }

      const { data, error } = await query;

      if (error) throw error;

      const typedData = (data || []).map(d => ({
        ...d,
        environment: d.environment as 'sandbox' | 'production',
        sync_enabled: d.sync_enabled ?? false,
        dry_run_mode: d.dry_run_mode ?? true,
        sync_mode: d.sync_mode ?? 'manual'
      }));

      setConfigs(typedData);
      
      // Auto-select config matching user's location
      if (typedData.length > 0) {
        const matchingConfig = typedData.find(c => c.location_key === assignedStore);
        setSelectedConfig(matchingConfig || typedData[0]);
      }
    } catch (error: any) {
      toast.error('Failed to load configurations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTriggered = () => {
    setRefreshKey(k => k + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle>No eBay Configuration Found</CardTitle>
              <CardDescription>
                You need to set up an eBay store configuration first.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <a href="/ebay" className="text-primary hover:underline">
                Go to eBay Settings →
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6" />
            eBay Inventory Sync
          </h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Multi-location inventory aggregation and waterfall fulfillment</span>
            {assignedStoreName && (
              <Badge variant="outline" className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {assignedStoreName}
              </Badge>
            )}
          </div>
        </div>

        {/* Store Selector */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select
                  value={selectedConfig?.id || ''}
                  onValueChange={(id) => {
                    const config = configs.find(c => c.id === id);
                    setSelectedConfig(config || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select store configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map(config => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.store_key} ({config.environment})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedConfig && (
                <div className="flex items-center gap-2">
                  <Badge variant={selectedConfig.environment === 'production' ? 'destructive' : 'secondary'}>
                    {selectedConfig.environment}
                  </Badge>
                  <Badge variant={selectedConfig.dry_run_mode ? 'outline' : 'default'}>
                    {selectedConfig.dry_run_mode ? 'Dry Run' : 'Live'}
                  </Badge>
                  <Badge variant={selectedConfig.sync_enabled ? 'default' : 'secondary'}>
                    {selectedConfig.sync_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedConfig && (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Locations
              </TabsTrigger>
              <TabsTrigger value="controls" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Controls
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <EbayAggregatePreview 
                key={`aggregate-${refreshKey}`}
                storeKey={selectedConfig.store_key} 
                onRecalculateAll={handleSyncTriggered}
              />
            </TabsContent>

            <TabsContent value="locations">
              <EbayLocationPriority storeKey={selectedConfig.store_key} />
            </TabsContent>

            <TabsContent value="controls">
              <EbaySyncControls 
                storeKey={selectedConfig.store_key}
                configId={selectedConfig.id}
                onSyncTriggered={handleSyncTriggered}
              />
            </TabsContent>

            <TabsContent value="history">
              <EbaySyncLog 
                key={`log-${refreshKey}`}
                storeKey={selectedConfig.store_key} 
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
