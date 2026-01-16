import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Key, Eye, EyeOff, Save, CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StoreSecretStatus {
  hasSecret: boolean;
  secretLength: number | null;
  lastUpdated: string | null;
}

const STORES = [
  { key: 'hawaii', name: 'Hawaii Store', prefix: 'SHOPIFY_HAWAII' },
  { key: 'las_vegas', name: 'Las Vegas Store', prefix: 'SHOPIFY_LAS_VEGAS' },
];

export function WebhookSecretsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [secretStatus, setSecretStatus] = useState<Record<string, StoreSecretStatus>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSecretStatus();
  }, []);

  const loadSecretStatus = async () => {
    setLoading(true);
    try {
      const keyNames = STORES.map(store => `${store.prefix}_WEBHOOK_SECRET`);
      
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_name, key_value, updated_at')
        .in('key_name', keyNames);

      if (error) throw error;

      const status: Record<string, StoreSecretStatus> = {};
      
      STORES.forEach(store => {
        const keyName = `${store.prefix}_WEBHOOK_SECRET`;
        const setting = data?.find(s => s.key_name === keyName);
        
        status[store.key] = {
          hasSecret: Boolean(setting?.key_value && setting.key_value.length > 0),
          secretLength: setting?.key_value?.length || null,
          lastUpdated: setting?.updated_at || null,
        };
      });

      setSecretStatus(status);
    } catch (error) {
      console.error('Error loading secret status:', error);
      toast.error('Failed to load webhook secret status');
    } finally {
      setLoading(false);
    }
  };

  const saveSecret = async (storeKey: string) => {
    const store = STORES.find(s => s.key === storeKey);
    if (!store) return;

    const secretValue = secrets[storeKey];
    if (!secretValue || secretValue.trim().length === 0) {
      toast.error('Please enter a webhook secret');
      return;
    }

    setSaving(storeKey);
    try {
      const keyName = `${store.prefix}_WEBHOOK_SECRET`;
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key_name: keyName,
          key_value: secretValue.trim(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key_name',
        });

      if (error) throw error;

      toast.success(`Webhook secret saved for ${store.name}`);
      setSecrets(prev => ({ ...prev, [storeKey]: '' }));
      await loadSecretStatus();
    } catch (error) {
      console.error('Error saving secret:', error);
      toast.error('Failed to save webhook secret');
    } finally {
      setSaving(null);
    }
  };

  const toggleShowSecret = (storeKey: string) => {
    setShowSecrets(prev => ({ ...prev, [storeKey]: !prev[storeKey] }));
  };

  const getStatusBadge = (status: StoreSecretStatus | undefined) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    if (status.hasSecret) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Configured ({status.secretLength} chars)
        </Badge>
      );
    }
    
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        Not Configured
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading webhook secrets...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            <CardTitle>Webhook Secrets Manager</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadSecretStatus}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
        <CardDescription>
          Manage Shopify webhook secrets for HMAC validation. Get these from your Shopify Admin &gt; Settings &gt; Notifications &gt; Webhooks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Webhook secrets must match exactly what's configured in Shopify. 
            If HMAC validation is failing, re-copy the secret from Shopify Admin.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue={STORES[0].key}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${STORES.length}, 1fr)` }}>
            {STORES.map(store => (
              <TabsTrigger key={store.key} value={store.key} className="flex items-center gap-2">
                {store.name}
                {secretStatus[store.key]?.hasSecret ? (
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                ) : (
                  <XCircle className="w-3 h-3 text-destructive" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {STORES.map(store => (
            <TabsContent key={store.key} value={store.key} className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <h4 className="font-medium">{store.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Key: <code className="bg-muted px-1 rounded">{store.prefix}_WEBHOOK_SECRET</code>
                  </p>
                </div>
                {getStatusBadge(secretStatus[store.key])}
              </div>

              {secretStatus[store.key]?.lastUpdated && (
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(secretStatus[store.key].lastUpdated!).toLocaleString()}
                </p>
              )}

              <div className="space-y-3">
                <Label htmlFor={`secret-${store.key}`}>
                  {secretStatus[store.key]?.hasSecret ? 'Update Webhook Secret' : 'Set Webhook Secret'}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`secret-${store.key}`}
                      type={showSecrets[store.key] ? 'text' : 'password'}
                      placeholder="Paste your Shopify webhook secret here..."
                      value={secrets[store.key] || ''}
                      onChange={(e) => setSecrets(prev => ({ ...prev, [store.key]: e.target.value }))}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleShowSecret(store.key)}
                    >
                      {showSecrets[store.key] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => saveSecret(store.key)}
                    disabled={saving === store.key || !secrets[store.key]}
                  >
                    {saving === store.key ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The webhook secret is used to verify that incoming webhooks are actually from Shopify.
                </p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
