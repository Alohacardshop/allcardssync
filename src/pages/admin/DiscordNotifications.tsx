import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Send, Loader2, CheckCircle } from 'lucide-react';
import { AdminGuard } from '@/components/AdminGuard';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { BusinessHoursConfig, type BusinessHoursData } from '@/components/admin/BusinessHoursConfig';

interface RegionDiscordConfig {
  webhookUrl: string;
  roleId: string;
  channelName: string;
  enabled: boolean;
  notifyCancellations: boolean;
}

const REGIONS = [
  { id: 'hawaii', label: '🌺 Hawaii' },
  { id: 'las_vegas', label: '🎰 Las Vegas' },
];

const DISCORD_KEYS = ['discord.webhook_url', 'discord.role_id', 'discord.channel_name', 'discord.enabled', 'discord.notify_cancellations'] as const;
const ALL_KEYS = [...DISCORD_KEYS, 'operations.business_hours'] as const;

export default function DiscordNotifications() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, RegionDiscordConfig>>({
    hawaii: { webhookUrl: '', roleId: '', channelName: '', enabled: false, notifyCancellations: false },
    las_vegas: { webhookUrl: '', roleId: '', channelName: '', enabled: false, notifyCancellations: false },
  });
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  const [manualStoreKey, setManualStoreKey] = useState('');
  const [sendingManual, setSendingManual] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('region_settings')
        .select('region_id, setting_key, setting_value')
        .in('setting_key', [...DISCORD_KEYS]);

      if (error) throw error;

      const newConfigs = { ...configs };
      data?.forEach((row: any) => {
        const region = row.region_id;
        if (!newConfigs[region]) return;
        switch (row.setting_key) {
          case 'discord.webhook_url':
            newConfigs[region].webhookUrl = row.setting_value || '';
            break;
          case 'discord.role_id':
            newConfigs[region].roleId = row.setting_value || '';
            break;
          case 'discord.channel_name':
            newConfigs[region].channelName = row.setting_value || '';
            break;
          case 'discord.enabled':
            newConfigs[region].enabled = row.setting_value !== false;
            break;
          case 'discord.notify_cancellations':
            newConfigs[region].notifyCancellations = row.setting_value === true;
            break;
        }
      });
      setConfigs(newConfigs);
    } catch (error) {
      console.error('Failed to load config:', error);
      toast({ title: 'Error', description: 'Failed to load Discord configuration', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveRegionConfig = async (regionId: string) => {
    setSaving(regionId);
    try {
      const config = configs[regionId];
      if (!config) throw new Error('Invalid region');

      const updates = [
        { region_id: regionId, setting_key: 'discord.webhook_url', setting_value: config.webhookUrl },
        { region_id: regionId, setting_key: 'discord.role_id', setting_value: config.roleId },
        { region_id: regionId, setting_key: 'discord.channel_name', setting_value: config.channelName },
        { region_id: regionId, setting_key: 'discord.enabled', setting_value: config.enabled },
        { region_id: regionId, setting_key: 'discord.notify_cancellations', setting_value: config.notifyCancellations },
      ];

      for (const u of updates) {
        const { error } = await supabase
          .from('region_settings')
          .upsert(
            { region_id: u.region_id, setting_key: u.setting_key, setting_value: u.setting_value as any },
            { onConflict: 'region_id,setting_key' }
          );
        if (error) throw error;
      }

      toast({ title: 'Saved', description: `Discord settings saved for ${regionId}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const updateConfig = (regionId: string, field: keyof RegionDiscordConfig, value: any) => {
    setConfigs((prev) => ({
      ...prev,
      [regionId]: { ...prev[regionId], [field]: value },
    }));
  };

  const sendManualNotification = async () => {
    if (!manualOrderNumber || !manualStoreKey) {
      toast({ title: 'Error', description: 'Please enter both order number and store key', variant: 'destructive' });
      return;
    }

    setSendingManual(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-order-notify', {
        body: { orderNumber: manualOrderNumber, storeKey: manualStoreKey },
      });

      if (error) throw error;

      toast({ title: 'Success', description: `Notification sent for order ${data.orderNumber} (${data.region})` });
      setManualOrderNumber('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send notification', variant: 'destructive' });
    } finally {
      setSendingManual(false);
    }
  };

  if (loading) {
    return (
      <AdminGuard>
        <LoadingState message="Loading configuration..." />
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <PageHeader
          title="Discord Notifications"
          description="Configure per-region Discord alerts for online orders"
          showEcosystem
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          }
        />

        <div className="space-y-6">
          {/* Per-Region Config */}
          <Tabs defaultValue="hawaii">
            <TabsList className="grid w-full grid-cols-2">
              {REGIONS.map((r) => (
                <TabsTrigger key={r.id} value={r.id}>
                  {r.label}
                  {configs[r.id]?.enabled && <CheckCircle className="h-3 w-3 ml-1.5 text-primary" />}
                </TabsTrigger>
              ))}
            </TabsList>

            {REGIONS.map((region) => (
              <TabsContent key={region.id} value={region.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {region.label} Discord Settings
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`enabled-${region.id}`} className="text-sm font-normal">
                          Enabled
                        </Label>
                        <Switch
                          id={`enabled-${region.id}`}
                          checked={configs[region.id]?.enabled ?? false}
                          onCheckedChange={(checked) => updateConfig(region.id, 'enabled', checked)}
                        />
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Webhook URL, role mention, and channel name for {region.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor={`webhook-${region.id}`}>Webhook URL</Label>
                      <Input
                        id={`webhook-${region.id}`}
                        placeholder="https://discord.com/api/webhooks/..."
                        value={configs[region.id]?.webhookUrl ?? ''}
                        onChange={(e) => updateConfig(region.id, 'webhookUrl', e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`role-${region.id}`}>Staff Role ID</Label>
                      <Input
                        id={`role-${region.id}`}
                        placeholder="123456789012345678"
                        value={configs[region.id]?.roleId ?? ''}
                        onChange={(e) => updateConfig(region.id, 'roleId', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enable Developer Mode in Discord → right-click role → Copy ID
                      </p>
                    </div>

                    <div>
                      <Label htmlFor={`channel-${region.id}`}>Channel Name (display only)</Label>
                      <Input
                        id={`channel-${region.id}`}
                        placeholder="e.g., #orders"
                        value={configs[region.id]?.channelName ?? ''}
                        onChange={(e) => updateConfig(region.id, 'channelName', e.target.value)}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label htmlFor={`cancellations-${region.id}`} className="text-sm font-medium">
                          Notify on Cancellations
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Send a Discord alert when an order is cancelled
                        </p>
                      </div>
                      <Switch
                        id={`cancellations-${region.id}`}
                        checked={configs[region.id]?.notifyCancellations ?? false}
                        onCheckedChange={(checked) => updateConfig(region.id, 'notifyCancellations', checked)}
                      />
                    </div>

                    <Button onClick={() => saveRegionConfig(region.id)} disabled={saving === region.id}>
                      {saving === region.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* Manual Notification */}
          <Card>
            <CardHeader>
              <CardTitle>Send Manual Notification</CardTitle>
              <CardDescription>
                Send a Discord notification for any order. Routes to the correct region automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="manual-order">Order Name/Number</Label>
                <Input
                  id="manual-order"
                  placeholder="e.g., #1234 or 15-13759-56842"
                  value={manualOrderNumber}
                  onChange={(e) => setManualOrderNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="manual-store">Store Key</Label>
                <Input
                  id="manual-store"
                  placeholder="e.g., HAWAII or LAS_VEGAS"
                  value={manualStoreKey}
                  onChange={(e) => setManualStoreKey(e.target.value)}
                />
              </div>
              <Button
                onClick={sendManualNotification}
                disabled={sendingManual || !manualOrderNumber || !manualStoreKey}
              >
                <Send className="mr-2 h-4 w-4" />
                {sendingManual ? 'Sending…' : 'Send Notification'}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button variant="outline" onClick={() => navigate('/admin')}>
              Back to Admin
            </Button>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
