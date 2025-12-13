import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  ExternalLink, CheckCircle, AlertCircle, Loader2, Settings, Link2, RefreshCw,
  ShoppingCart, Clock, Package, ArrowRightLeft, MapPin
} from 'lucide-react';
import { EbaySyncQueueMonitor } from '@/components/admin/EbaySyncQueueMonitor';
import { EbayBulkListing } from '@/components/admin/EbayBulkListing';
import { Link } from 'react-router-dom';
import { useStore } from '@/contexts/StoreContext';

interface EbayStoreConfig {
  id: string;
  store_key: string;
  location_key: string | null;
  environment: 'sandbox' | 'production';
  marketplace_id: string;
  ebay_user_id: string | null;
  oauth_connected_at: string | null;
  is_active: boolean;
  default_category_id: string | null;
  default_condition_id: string | null;
  default_fulfillment_policy_id: string | null;
  default_payment_policy_id: string | null;
  default_return_policy_id: string | null;
  title_template: string | null;
  description_template: string | null;
}

interface EbayPolicy {
  id: string;
  store_key: string;
  policy_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  synced_at: string;
}

export default function EbayApp() {
  const { assignedStore, assignedStoreName, isAdmin } = useStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncingPolicies, setSyncingPolicies] = useState(false);
  const [configs, setConfigs] = useState<EbayStoreConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EbayStoreConfig | null>(null);
  const [newStoreKey, setNewStoreKey] = useState('');
  
  // Policy states
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<EbayPolicy[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<EbayPolicy[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<EbayPolicy[]>([]);
  const [policiesLastSynced, setPoliciesLastSynced] = useState<string | null>(null);

  useEffect(() => {
    if (assignedStore) {
      loadConfigs();
    }
  }, [assignedStore]);

  useEffect(() => {
    if (selectedConfig?.store_key) {
      loadPolicies(selectedConfig.store_key);
    }
  }, [selectedConfig?.store_key]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      // Build query - filter by user's location unless admin
      let query = supabase
        .from('ebay_store_config')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Non-admins only see configs for their assigned store
      if (!isAdmin && assignedStore) {
        query = query.eq('location_key', assignedStore);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const typedData = (data || []).map(d => ({
        ...d,
        environment: d.environment as 'sandbox' | 'production'
      }));
      
      setConfigs(typedData);
      
      // Auto-select config matching user's location
      if (typedData.length > 0) {
        const matchingConfig = typedData.find(c => c.location_key === assignedStore);
        setSelectedConfig(matchingConfig || typedData[0]);
      }
    } catch (error: any) {
      toast.error('Failed to load eBay configurations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPolicies = async (storeKey: string) => {
    try {
      const [fulfillment, payment, returns] = await Promise.all([
        supabase
          .from('ebay_fulfillment_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name'),
        supabase
          .from('ebay_payment_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name'),
        supabase
          .from('ebay_return_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name')
      ]);

      if (fulfillment.data) setFulfillmentPolicies(fulfillment.data);
      if (payment.data) setPaymentPolicies(payment.data);
      if (returns.data) setReturnPolicies(returns.data);

      const allPolicies = [
        ...(fulfillment.data || []),
        ...(payment.data || []),
        ...(returns.data || [])
      ];
      
      if (allPolicies.length > 0) {
        const latestSync = allPolicies.reduce((latest, p) => {
          const syncDate = new Date(p.synced_at);
          return syncDate > latest ? syncDate : latest;
        }, new Date(0));
        
        if (latestSync.getTime() > 0) {
          setPoliciesLastSynced(latestSync.toISOString());
        }
      } else {
        setPoliciesLastSynced(null);
      }
    } catch (error: any) {
      console.error('Failed to load policies:', error);
    }
  };

  const syncPolicies = async () => {
    if (!selectedConfig) return;

    setSyncingPolicies(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-sync-policies', {
        body: { store_key: selectedConfig.store_key }
      });

      if (error) throw error;

      toast.success(data.message || 'Policies synced successfully');
      await loadPolicies(selectedConfig.store_key);
    } catch (error: any) {
      toast.error('Failed to sync policies: ' + error.message);
    } finally {
      setSyncingPolicies(false);
    }
  };

  const createConfig = async () => {
    if (!newStoreKey.trim()) {
      toast.error('Please enter a store key');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ebay_store_config')
        .insert({
          store_key: newStoreKey.trim(),
          location_key: assignedStore, // Link to user's location
          environment: 'sandbox',
          marketplace_id: 'EBAY_US',
          is_active: false, // Start inactive for safety
          sync_enabled: false,
          dry_run_mode: true
        })
        .select()
        .single();

      if (error) throw error;

      const typedData = {
        ...data,
        environment: data.environment as 'sandbox' | 'production'
      };

      setConfigs([typedData, ...configs]);
      setSelectedConfig(typedData);
      setNewStoreKey('');
      toast.success('eBay store configuration created (sandbox mode)');
    } catch (error: any) {
      toast.error('Failed to create configuration: ' + error.message);
    }
  };

  const saveConfig = async () => {
    if (!selectedConfig) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ebay_store_config')
        .update({
          environment: selectedConfig.environment,
          marketplace_id: selectedConfig.marketplace_id,
          is_active: selectedConfig.is_active,
          default_category_id: selectedConfig.default_category_id,
          default_fulfillment_policy_id: selectedConfig.default_fulfillment_policy_id,
          default_payment_policy_id: selectedConfig.default_payment_policy_id,
          default_return_policy_id: selectedConfig.default_return_policy_id,
          title_template: selectedConfig.title_template,
          description_template: selectedConfig.description_template
        })
        .eq('id', selectedConfig.id);

      if (error) throw error;

      toast.success('Configuration saved');
      loadConfigs();
    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const connectEbay = async () => {
    if (!selectedConfig) return;

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-auth-init', {
        body: { store_key: selectedConfig.store_key }
      });

      if (error) throw error;
      if (!data.auth_url) throw new Error('No auth URL returned');

      const authWindow = window.open(data.auth_url, 'ebay_auth', 'width=600,height=700');
      
      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          setConnecting(false);
          loadConfigs();
          toast.success('eBay connection process completed. Check status below.');
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(pollTimer);
        setConnecting(false);
      }, 300000);

    } catch (error: any) {
      toast.error('Failed to start eBay connection: ' + error.message);
      setConnecting(false);
    }
  };

  const updateConfig = (updates: Partial<EbayStoreConfig>) => {
    if (!selectedConfig) return;
    setSelectedConfig({ ...selectedConfig, ...updates });
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              eBay Integration
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Manage eBay connection, listings, and sync queue</span>
              {assignedStoreName && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {assignedStoreName}
                </Badge>
              )}
            </div>
          </div>
          <Link to="/ebay/sync">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Inventory Sync Dashboard
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Bulk Listing
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Sync Queue
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Progress Indicator */}
            {configs.length > 0 && selectedConfig && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium">1. Config Created</span>
                      </div>
                      <div className="h-px w-8 bg-border" />
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          selectedConfig.oauth_connected_at 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {selectedConfig.oauth_connected_at ? <CheckCircle className="h-5 w-5" /> : '2'}
                        </div>
                        <span className={`text-sm ${selectedConfig.oauth_connected_at ? 'font-medium' : 'text-muted-foreground'}`}>
                          2. eBay Connected
                        </span>
                      </div>
                      <div className="h-px w-8 bg-border" />
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          fulfillmentPolicies.length > 0 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {fulfillmentPolicies.length > 0 ? <CheckCircle className="h-5 w-5" /> : '3'}
                        </div>
                        <span className={`text-sm ${fulfillmentPolicies.length > 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                          3. Policies Synced
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Welcome/Onboarding when no configs */}
            {configs.length === 0 ? (
              <Card className="border-primary/30">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Welcome to eBay Integration</CardTitle>
                  <CardDescription className="text-base">
                    Connect your eBay account to start listing items directly from your inventory
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Setup Steps */}
                  <div className="grid gap-4 py-4">
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        1
                      </div>
                      <div>
                        <p className="font-medium">Create Store Configuration</p>
                        <p className="text-sm text-muted-foreground">
                          Set up a configuration to link your inventory with eBay
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        2
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Connect eBay Account</p>
                        <p className="text-sm text-muted-foreground">
                          Authorize access to your eBay seller account
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        3
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Sync Business Policies</p>
                        <p className="text-sm text-muted-foreground">
                          Import your shipping, payment, and return policies
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Create First Config */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="store-key">Store Key</Label>
                      <p className="text-sm text-muted-foreground">
                        A unique identifier for this eBay configuration (e.g., "hawaii", "main", "primary")
                      </p>
                      <div className="flex gap-2">
                        <Input
                          id="store-key"
                          placeholder="Enter store key..."
                          value={newStoreKey}
                          onChange={(e) => setNewStoreKey(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newStoreKey.trim() && createConfig()}
                        />
                        <Button onClick={createConfig} disabled={!newStoreKey.trim()} size="lg">
                          Get Started
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Store Selection / Creation when configs exist */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    eBay Store Configuration
                  </CardTitle>
                  <CardDescription>Select or create an eBay store configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Store</Label>
                    <Select
                      value={selectedConfig?.id || ''}
                      onValueChange={(id) => {
                        const config = configs.find(c => c.id === id);
                        setSelectedConfig(config || null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a store configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        {configs.map((config) => (
                          <SelectItem key={config.id} value={config.id}>
                            {config.store_key} ({config.environment})
                            {config.oauth_connected_at && ' ✓'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Add Another Store</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="New store key (e.g., 'secondary')"
                        value={newStoreKey}
                        onChange={(e) => setNewStoreKey(e.target.value)}
                      />
                      <Button onClick={createConfig} disabled={!newStoreKey.trim()} variant="outline">
                        Create New
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedConfig && (
              <>
                {/* Connection Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5" />
                      eBay Account Connection
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {selectedConfig.oauth_connected_at ? (
                          <>
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            <div>
                              <p className="font-medium">Connected to eBay</p>
                              <p className="text-sm text-muted-foreground">
                                User: {selectedConfig.ebay_user_id || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Connected: {new Date(selectedConfig.oauth_connected_at).toLocaleDateString()}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-6 w-6 text-yellow-500" />
                            <div>
                              <p className="font-medium">Not Connected</p>
                              <p className="text-sm text-muted-foreground">
                                Connect your eBay account to enable listing
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <Button 
                        onClick={connectEbay} 
                        disabled={connecting}
                        variant={selectedConfig.oauth_connected_at ? 'outline' : 'default'}
                      >
                        {connecting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : selectedConfig.oauth_connected_at ? (
                          'Reconnect'
                        ) : (
                          <>
                            Connect eBay Account
                            <ExternalLink className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Environment</Label>
                        <Select
                          value={selectedConfig.environment}
                          onValueChange={(v) => updateConfig({ environment: v as 'sandbox' | 'production' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                            <SelectItem value="production">Production (Live)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Marketplace</Label>
                        <Select
                          value={selectedConfig.marketplace_id}
                          onValueChange={(v) => updateConfig({ marketplace_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EBAY_US">United States</SelectItem>
                            <SelectItem value="EBAY_CA">Canada</SelectItem>
                            <SelectItem value="EBAY_GB">United Kingdom</SelectItem>
                            <SelectItem value="EBAY_AU">Australia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Active</Label>
                        <p className="text-sm text-muted-foreground">Enable eBay listing for this store</p>
                      </div>
                      <Switch
                        checked={selectedConfig.is_active || false}
                        onCheckedChange={(checked) => updateConfig({ is_active: checked })}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Business Policies */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Business Policies</CardTitle>
                        <CardDescription>
                          Sync and select your eBay shipping, payment, and return policies
                        </CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={syncPolicies}
                        disabled={syncingPolicies || !selectedConfig.oauth_connected_at}
                      >
                        {syncingPolicies ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Policies
                          </>
                        )}
                      </Button>
                    </div>
                    {policiesLastSynced && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last synced: {new Date(policiesLastSynced).toLocaleString()}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!selectedConfig.oauth_connected_at ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Connect your eBay account to sync and select business policies
                      </p>
                    ) : fulfillmentPolicies.length === 0 && paymentPolicies.length === 0 && returnPolicies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No policies synced yet. Click "Sync Policies" to load your eBay business policies.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label>Fulfillment Policy (Shipping)</Label>
                          <Select
                            value={selectedConfig.default_fulfillment_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_fulfillment_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a fulfillment policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {fulfillmentPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name} {policy.is_default && '(Default)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Payment Policy</Label>
                          <Select
                            value={selectedConfig.default_payment_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_payment_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a payment policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name} {policy.is_default && '(Default)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Return Policy</Label>
                          <Select
                            value={selectedConfig.default_return_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_return_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a return policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {returnPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name} {policy.is_default && '(Default)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Listing Defaults */}
                <Card>
                  <CardHeader>
                    <CardTitle>Listing Defaults</CardTitle>
                    <CardDescription>Default settings for new eBay listings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Default Category ID</Label>
                      <Input
                        placeholder="e.g., 183454 (Trading Cards)"
                        value={selectedConfig.default_category_id || ''}
                        onChange={(e) => updateConfig({ default_category_id: e.target.value || null })}
                      />
                      <p className="text-xs text-muted-foreground">
                        <a 
                          href="https://www.isoldwhat.com/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Find eBay Category IDs
                        </a>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Title Template</Label>
                      <Input
                        placeholder="{subject} {grade} {grading_company} - {brand_title}"
                        value={selectedConfig.title_template || ''}
                        onChange={(e) => updateConfig({ title_template: e.target.value || null })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Available: {'{subject}'}, {'{grade}'}, {'{grading_company}'}, {'{brand_title}'}, {'{year}'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Description Template</Label>
                      <textarea
                        className="w-full min-h-[100px] p-3 border rounded-md bg-background"
                        placeholder="Enter your default listing description template..."
                        value={selectedConfig.description_template || ''}
                        onChange={(e) => updateConfig({ description_template: e.target.value || null })}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button onClick={saveConfig} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Configuration'
                    )}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Bulk Listing Tab */}
          <TabsContent value="bulk">
            <EbayBulkListing />
          </TabsContent>

          {/* Sync Queue Tab */}
          <TabsContent value="queue">
            <EbaySyncQueueMonitor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
