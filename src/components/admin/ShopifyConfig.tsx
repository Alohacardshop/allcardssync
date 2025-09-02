import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Save, TestTube, Key, Globe, Webhook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface StoreConfig {
  domain: string;
  hasAccessToken: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
}

interface ConfigFormData {
  domain: string;
  accessToken: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
}

const STORES = [
  { key: 'hawaii', name: 'Hawaii Store', prefix: 'SHOPIFY_HAWAII' },
  { key: 'las_vegas', name: 'Las Vegas Store', prefix: 'SHOPIFY_LAS_VEGAS' }
] as const;

export function ShopifyConfig() {
  const [configs, setConfigs] = useState<Record<string, StoreConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, ConfigFormData>>({});

  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = async () => {
    try {
      setLoading(true);
      const allKeys = STORES.flatMap(store => [
        `${store.prefix}_STORE_DOMAIN`,
        `${store.prefix}_ACCESS_TOKEN`, 
        `${store.prefix}_API_KEY`,
        `${store.prefix}_API_SECRET`,
        `${store.prefix}_WEBHOOK_SECRET`
      ]);

      const { data: settings, error } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', allKeys);

      if (error) throw error;

      const newConfigs: Record<string, StoreConfig> = {};
      const newFormData: Record<string, ConfigFormData> = {};

      STORES.forEach(store => {
        const domain = settings?.find(s => s.key_name === `${store.prefix}_STORE_DOMAIN`)?.key_value || '';
        const hasAccessToken = Boolean(settings?.find(s => s.key_name === `${store.prefix}_ACCESS_TOKEN`)?.key_value);
        const hasApiKey = Boolean(settings?.find(s => s.key_name === `${store.prefix}_API_KEY`)?.key_value);
        const hasApiSecret = Boolean(settings?.find(s => s.key_name === `${store.prefix}_API_SECRET`)?.key_value);
        const hasWebhookSecret = Boolean(settings?.find(s => s.key_name === `${store.prefix}_WEBHOOK_SECRET`)?.key_value);

        newConfigs[store.key] = {
          domain,
          hasAccessToken,
          hasApiKey,
          hasApiSecret,
          hasWebhookSecret
        };

        newFormData[store.key] = {
          domain,
          accessToken: '',
          apiKey: '',
          apiSecret: '',
          webhookSecret: ''
        };
      });

      setConfigs(newConfigs);
      setFormData(newFormData);
    } catch (error) {
      console.error('Error loading configurations:', error);
      toast({
        title: "Error",
        description: "Failed to load Shopify configurations.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (storeKey: string, field: keyof ConfigFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [storeKey]: {
        ...prev[storeKey],
        [field]: value
      }
    }));
  };

  const saveConfiguration = async (storeKey: string) => {
    const store = STORES.find(s => s.key === storeKey);
    if (!store) return;

    try {
      setSaving(storeKey);
      const data = formData[storeKey];

      // Prepare updates
      const updates = [];

      // Domain (stored in system_settings)
      if (data.domain.trim()) {
        updates.push({
          key_name: `${store.prefix}_STORE_DOMAIN`,
          key_value: data.domain.trim(),
          description: `Shopify store domain for ${store.name}`,
          category: 'shopify'
        });
      }

      // Access Token (sensitive - stored in system_settings)
      if (data.accessToken.trim()) {
        updates.push({
          key_name: `${store.prefix}_ACCESS_TOKEN`,
          key_value: data.accessToken.trim(),
          description: `Shopify Admin API access token for ${store.name}`,
          category: 'shopify'
        });
      }

      // API Key (sensitive - stored in system_settings)
      if (data.apiKey.trim()) {
        updates.push({
          key_name: `${store.prefix}_API_KEY`,
          key_value: data.apiKey.trim(),
          description: `Shopify API Key for ${store.name}`,
          category: 'shopify'
        });
      }

      // API Secret (sensitive - stored in system_settings)
      if (data.apiSecret.trim()) {
        updates.push({
          key_name: `${store.prefix}_API_SECRET`,
          key_value: data.apiSecret.trim(),
          description: `Shopify API Secret for ${store.name}`,
          category: 'shopify'
        });
      }

      // Webhook Secret (sensitive - stored in system_settings)
      if (data.webhookSecret.trim()) {
        updates.push({
          key_name: `${store.prefix}_WEBHOOK_SECRET`,
          key_value: data.webhookSecret.trim(),
          description: `Shopify Webhook Secret for ${store.name}`,
          category: 'shopify'
        });
      }

      // Perform upserts
      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(update, { 
            onConflict: 'key_name',
            ignoreDuplicates: false 
          });

        if (error) throw error;
      }

      // Clear form data for this store
      setFormData(prev => ({
        ...prev,
        [storeKey]: {
          domain: '',
          accessToken: '',
          apiKey: '',
          apiSecret: '',
          webhookSecret: ''
        }
      }));

      // Reload configurations
      await loadConfigurations();

      toast({
        title: "Success",
        description: `${store.name} configuration saved successfully.`
      });
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration.",
        variant: "destructive"
      });
    } finally {
      setSaving(null);
    }
  };

  const testConnection = async (storeKey: string) => {
    try {
      setTesting(storeKey);
      
      // Test basic connection first
      const { data: configData, error: configError } = await supabase.functions.invoke('shopify-config-check', {
        body: { storeKey }
      });

      if (configError) throw configError;

      // Test locations endpoint to get location count
      let locationCount = 0;
      let locationError = null;
      
      try {
        const { data: locationData } = await supabase.functions.invoke('shopify-locations', {
          body: { storeKey }
        });
        
        if (locationData?.ok) {
          locationCount = locationData.count || 0;
        }
      } catch (err) {
        locationError = err;
        console.warn('Error fetching locations during test:', err);
      }

      if (configData?.shop) {
        const shopName = configData.shop.name || 'Shopify store';
        let description = `Connected to ${shopName} successfully.`;
        
        if (locationError) {
          description += ` Warning: Could not fetch locations - ${locationError.message || 'unknown error'}.`;
        } else if (locationCount === 0) {
          description += ` Found 0 locations. Check if this store has active locations or if the access token has location permissions.`;
        } else {
          description += ` Found ${locationCount} location${locationCount !== 1 ? 's' : ''}.`;
        }
        
        toast({
          title: "Connection Test Complete",
          description,
          variant: locationError || locationCount === 0 ? "default" : "default"
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Unable to connect to Shopify store. Please check your configuration.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast({
        title: "Error",
        description: `Failed to test connection: ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setTesting(null);
    }
  };

  const getStatusBadge = (hasValue: boolean) => {
    return hasValue ? (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Configured
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Not Set
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading configurations...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Shopify Configuration</h2>
        <p className="text-muted-foreground">
          Manage Shopify API credentials and webhook settings for each store.
        </p>
      </div>

      <Tabs defaultValue={STORES[0].key} className="space-y-4">
        <TabsList>
          {STORES.map(store => (
            <TabsTrigger key={store.key} value={store.key}>
              {store.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {STORES.map(store => (
          <TabsContent key={store.key} value={store.key}>
            <div className="space-y-6">
              {/* Current Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    {store.name} - Current Status
                  </CardTitle>
                  <CardDescription>
                    Current configuration status for this store
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">Store Domain</span>
                      {getStatusBadge(Boolean(configs[store.key]?.domain))}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">Access Token</span>
                      {getStatusBadge(configs[store.key]?.hasAccessToken || false)}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">API Key</span>
                      {getStatusBadge(configs[store.key]?.hasApiKey || false)}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">API Secret</span>
                      {getStatusBadge(configs[store.key]?.hasApiSecret || false)}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">Webhook Secret</span>
                      {getStatusBadge(configs[store.key]?.hasWebhookSecret || false)}
                    </div>
                  </div>

                  {configs[store.key]?.domain && (
                    <div className="pt-4">
                      <Label className="text-sm font-medium">Current Domain</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {configs[store.key].domain}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={() => testConnection(store.key)}
                      disabled={testing === store.key}
                      variant="outline"
                      className="gap-2"
                    >
                      <TestTube className="h-4 w-4" />
                      {testing === store.key ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Configuration Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Update Configuration
                  </CardTitle>
                  <CardDescription>
                    Update Shopify API credentials and settings. Only fill in fields you want to change.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Leave fields empty to keep existing values. All credentials are stored securely.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`domain-${store.key}`}>Store Domain</Label>
                      <Input
                        id={`domain-${store.key}`}
                        type="text"
                        placeholder="mystore.myshopify.com"
                        value={formData[store.key]?.domain || ''}
                        onChange={(e) => updateFormData(store.key, 'domain', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Your Shopify store domain (without https://)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`accessToken-${store.key}`}>Admin Access Token</Label>
                      <Input
                        id={`accessToken-${store.key}`}
                        type="password"
                        placeholder="shpat_..."
                        value={formData[store.key]?.accessToken || ''}
                        onChange={(e) => updateFormData(store.key, 'accessToken', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Private app access token with admin permissions
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`apiKey-${store.key}`}>API Key</Label>
                      <Input
                        id={`apiKey-${store.key}`}
                        type="password"
                        placeholder="API Key"
                        value={formData[store.key]?.apiKey || ''}
                        onChange={(e) => updateFormData(store.key, 'apiKey', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shopify API Key for your app
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`apiSecret-${store.key}`}>API Secret</Label>
                      <Input
                        id={`apiSecret-${store.key}`}
                        type="password"
                        placeholder="API Secret"
                        value={formData[store.key]?.apiSecret || ''}
                        onChange={(e) => updateFormData(store.key, 'apiSecret', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shopify API Secret for your app
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor={`webhookSecret-${store.key}`} className="flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      Webhook Secret
                    </Label>
                    <Input
                      id={`webhookSecret-${store.key}`}
                      type="password"
                      placeholder="Webhook secret for validating webhooks"
                      value={formData[store.key]?.webhookSecret || ''}
                      onChange={(e) => updateFormData(store.key, 'webhookSecret', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Secret used to validate incoming webhook requests from Shopify
                    </p>
                  </div>

                  <div className="pt-4">
                    <Button 
                      onClick={() => saveConfiguration(store.key)}
                      disabled={saving === store.key}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {saving === store.key ? 'Saving...' : 'Save Configuration'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}