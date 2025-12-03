import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ExternalLink, CheckCircle, AlertCircle, Loader2, Settings, Link2 } from 'lucide-react';

interface EbayStoreConfig {
  id: string;
  store_key: string;
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

export default function EbaySettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [configs, setConfigs] = useState<EbayStoreConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EbayStoreConfig | null>(null);
  const [newStoreKey, setNewStoreKey] = useState('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ebay_store_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedData = (data || []).map(d => ({
        ...d,
        environment: d.environment as 'sandbox' | 'production'
      }));
      
      setConfigs(typedData);
      if (typedData.length > 0 && !selectedConfig) {
        setSelectedConfig(typedData[0]);
      }
    } catch (error: any) {
      toast.error('Failed to load eBay configurations: ' + error.message);
    } finally {
      setLoading(false);
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
          environment: 'sandbox',
          marketplace_id: 'EBAY_US',
          is_active: true
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
      toast.success('eBay store configuration created');
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

      // Open eBay auth in new window
      const authWindow = window.open(data.auth_url, 'ebay_auth', 'width=600,height=700');
      
      // Poll for window close and reload configs
      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          setConnecting(false);
          loadConfigs();
          toast.success('eBay connection process completed. Check status below.');
        }
      }, 1000);

      // Timeout after 5 minutes
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
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">eBay Settings</h1>
          <p className="text-muted-foreground">Configure eBay integration and listing defaults</p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Store Selection / Creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              eBay Store Configuration
            </CardTitle>
            <CardDescription>Select or create an eBay store configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configs.length > 0 && (
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
            )}

            <Separator />

            <div className="flex gap-2">
              <Input
                placeholder="New store key (e.g., 'main', 'secondary')"
                value={newStoreKey}
                onChange={(e) => setNewStoreKey(e.target.value)}
              />
              <Button onClick={createConfig} disabled={!newStoreKey.trim()}>
                Create New
              </Button>
            </div>
          </CardContent>
        </Card>

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

            {/* Listing Defaults */}
            <Card>
              <CardHeader>
                <CardTitle>Listing Defaults</CardTitle>
                <CardDescription>Default settings for new eBay listings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    <Label>Fulfillment Policy ID</Label>
                    <Input
                      placeholder="Your eBay fulfillment policy ID"
                      value={selectedConfig.default_fulfillment_policy_id || ''}
                      onChange={(e) => updateConfig({ default_fulfillment_policy_id: e.target.value || null })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Policy ID</Label>
                    <Input
                      placeholder="Your eBay payment policy ID"
                      value={selectedConfig.default_payment_policy_id || ''}
                      onChange={(e) => updateConfig({ default_payment_policy_id: e.target.value || null })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Return Policy ID</Label>
                    <Input
                      placeholder="Your eBay return policy ID"
                      value={selectedConfig.default_return_policy_id || ''}
                      onChange={(e) => updateConfig({ default_return_policy_id: e.target.value || null })}
                    />
                  </div>
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
      </div>
    </div>
  );
}
