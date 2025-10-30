import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Send } from 'lucide-react';
import { AdminGuard } from '@/components/AdminGuard';
import { Navigation } from '@/components/Navigation';

interface DiscordChannel {
  name: string;
  webhook_url: string;
}

interface DiscordConfig {
  webhooks: {
    channels: DiscordChannel[];
    immediate_channel: string;
    queued_channel: string;
  };
  mention: {
    enabled: boolean;
    role_id: string;
  };
  templates: {
    immediate: string;
    queued: string;
  };
}

const DEFAULT_TEMPLATES = {
  immediate: `<@&{role_id}> 🛍️ **NEW EBAY ORDER**

**Order Details:**
• Order #: \`{id}\`
• Customer: **{customer_name}**
• Total: **{total}**
• Created: {created_at}
• Tags: {tags}

---
_Order received during business hours_`,
  queued: `<@&{role_id}> 🌙 **QUEUED EBAY ORDER** (Off-Hours)

**Order Details:**
• Order #: \`{id}\`
• Customer: **{customer_name}**
• Total: **{total}**
• Created: {created_at}
• Tags: {tags}

---
_Order received outside business hours (before 9am or after 7pm HST)_`,
};

export default function DiscordNotifications() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<DiscordConfig>({
    webhooks: { channels: [{ name: 'Operations', webhook_url: '' }], immediate_channel: 'Operations', queued_channel: 'Operations' },
    mention: { enabled: true, role_id: '' },
    templates: DEFAULT_TEMPLATES,
  });
  const [testChannel, setTestChannel] = useState('');
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  const [manualStoreKey, setManualStoreKey] = useState('');
  const [sendingManual, setSendingManual] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['discord.webhooks', 'discord.mention', 'discord.templates']);

      if (error) throw error;

      const configMap: Record<string, any> = {};
      data?.forEach((item) => {
        configMap[item.key] = item.value;
      });

      setConfig({
        webhooks: configMap['discord.webhooks'] || config.webhooks,
        mention: configMap['discord.mention'] || config.mention,
        templates: configMap['discord.templates'] || config.templates,
      });
    } catch (error) {
      console.error('Failed to load config:', error);
      toast({ title: 'Error', description: 'Failed to load configuration', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      // Validate at least one webhook URL
      if (!config.webhooks.channels.some((ch) => ch.webhook_url.trim())) {
        throw new Error('At least one webhook URL is required');
      }

      // Validate role ID if mentions enabled
      if (config.mention.enabled && !config.mention.role_id.trim()) {
        throw new Error('Staff Role ID is required when mentions are enabled');
      }

      const updates = [
        { key: 'discord.webhooks', value: config.webhooks },
        { key: 'discord.mention', value: config.mention },
        { key: 'discord.templates', value: config.templates },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('app_settings')
          .upsert([{ key: update.key, value: update.value as any, updated_at: new Date().toISOString() }]);

        if (error) throw error;
      }

      toast({ title: 'Success', description: 'Configuration saved successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!testChannel) {
      toast({ title: 'Error', description: 'Please select a channel to test', variant: 'destructive' });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('discord-test', {
        body: {
          channelName: testChannel,
          payload: {
            id: 'TEST-12345',
            customer_name: 'Test Customer',
            total: '$99.99',
            created_at: new Date().toISOString(),
            tags: ['ebay', 'test'],
          },
        },
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Test message sent to Discord!' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send test message', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const sendManualNotification = async () => {
    if (!manualOrderNumber || !manualStoreKey) {
      toast({ title: 'Error', description: 'Please enter both order number and store key', variant: 'destructive' });
      return;
    }

    setSendingManual(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-order-notify', {
        body: {
          orderNumber: manualOrderNumber,
          storeKey: manualStoreKey,
        },
      });

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: `Notification sent for order ${data.orderNumber}` 
      });
      setManualOrderNumber('');
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send notification', 
        variant: 'destructive' 
      });
    } finally {
      setSendingManual(false);
    }
  };

  const addChannel = () => {
    setConfig({
      ...config,
      webhooks: {
        ...config.webhooks,
        channels: [...config.webhooks.channels, { name: `Channel ${config.webhooks.channels.length + 1}`, webhook_url: '' }],
      },
    });
  };

  const removeChannel = (index: number) => {
    const newChannels = config.webhooks.channels.filter((_, i) => i !== index);
    setConfig({
      ...config,
      webhooks: { ...config.webhooks, channels: newChannels },
    });
  };

  const updateChannel = (index: number, field: 'name' | 'webhook_url', value: string) => {
    const newChannels = [...config.webhooks.channels];
    newChannels[index] = { ...newChannels[index], [field]: value };
    setConfig({
      ...config,
      webhooks: { ...config.webhooks, channels: newChannels },
    });
  };

  const resetTemplates = () => {
    setConfig({ ...config, templates: DEFAULT_TEMPLATES });
    toast({ title: 'Templates Reset', description: 'Templates restored to defaults' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto py-8 px-4 max-w-4xl">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => navigate('/admin')}>
              ← Back to Admin
            </Button>
            <h1 className="text-3xl font-bold mt-4">Discord Notifications (eBay Orders)</h1>
            <p className="text-muted-foreground mt-2">
              Configure Discord alerts for eBay orders with business-hours logic
            </p>
          </div>

          <div className="space-y-6">
            {/* Discord Webhooks */}
            <Card>
              <CardHeader>
                <CardTitle>Discord Webhooks</CardTitle>
                <CardDescription>Add webhook URLs for different channels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.webhooks.channels.map((channel, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Channel name"
                        value={channel.name}
                        onChange={(e) => updateChannel(index, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="https://discord.com/api/webhooks/..."
                        value={channel.webhook_url}
                        onChange={(e) => updateChannel(index, 'webhook_url', e.target.value)}
                      />
                    </div>
                    {config.webhooks.channels.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeChannel(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={addChannel}>
                  <Plus className="h-4 w-4 mr-2" /> Add Channel
                </Button>

                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Default Immediate Channel</Label>
                    <RadioGroup
                      value={config.webhooks.immediate_channel}
                      onValueChange={(value) => setConfig({ ...config, webhooks: { ...config.webhooks, immediate_channel: value } })}
                    >
                      {config.webhooks.channels.map((ch) => (
                        <div key={ch.name} className="flex items-center space-x-2">
                          <RadioGroupItem value={ch.name} id={`imm-${ch.name}`} />
                          <Label htmlFor={`imm-${ch.name}`}>{ch.name}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label>Default Queued Channel</Label>
                    <RadioGroup
                      value={config.webhooks.queued_channel}
                      onValueChange={(value) => setConfig({ ...config, webhooks: { ...config.webhooks, queued_channel: value } })}
                    >
                      {config.webhooks.channels.map((ch) => (
                        <div key={ch.name} className="flex items-center space-x-2">
                          <RadioGroupItem value={ch.name} id={`queue-${ch.name}`} />
                          <Label htmlFor={`queue-${ch.name}`}>{ch.name}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mentions */}
            <Card>
              <CardHeader>
                <CardTitle>Mentions</CardTitle>
                <CardDescription>Configure role mentions for notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="mention-enabled"
                    checked={config.mention.enabled}
                    onCheckedChange={(checked) => setConfig({ ...config, mention: { ...config.mention, enabled: checked as boolean } })}
                  />
                  <Label htmlFor="mention-enabled">Include @staff mention</Label>
                </div>
                <div>
                  <Label htmlFor="role-id">Staff Role ID</Label>
                  <Input
                    id="role-id"
                    placeholder="123456789012345678"
                    value={config.mention.role_id}
                    onChange={(e) => setConfig({ ...config, mention: { ...config.mention, role_id: e.target.value } })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable Developer Mode in Discord, right-click role, Copy ID
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Templates */}
            <Card>
              <CardHeader>
                <CardTitle>Message Templates</CardTitle>
                <CardDescription>
                  Variables: {'{id}'}, {'{customer_name}'}, {'{total}'}, {'{created_at}'}, {'{tags}'}, {'{raw_json}'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="immediate-template">Immediate Template</Label>
                  <Textarea
                    id="immediate-template"
                    rows={5}
                    value={config.templates.immediate}
                    onChange={(e) => setConfig({ ...config, templates: { ...config.templates, immediate: e.target.value } })}
                  />
                </div>
                <div>
                  <Label htmlFor="queued-template">Queued Template</Label>
                  <Textarea
                    id="queued-template"
                    rows={5}
                    value={config.templates.queued}
                    onChange={(e) => setConfig({ ...config, templates: { ...config.templates, queued: e.target.value } })}
                  />
                </div>
                <Button variant="outline" onClick={resetTemplates}>
                  Reset to Defaults
                </Button>
              </CardContent>
            </Card>

            {/* Test */}
            <Card>
              <CardHeader>
                <CardTitle>Test</CardTitle>
                <CardDescription>Send a test notification to verify your configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="test-channel">Select Channel</Label>
                  <Select value={testChannel} onValueChange={setTestChannel}>
                    <SelectTrigger id="test-channel">
                      <SelectValue placeholder="Choose a channel..." />
                    </SelectTrigger>
                    <SelectContent>
                      {config.webhooks.channels.map((ch) => (
                        <SelectItem key={ch.name} value={ch.name}>
                          {ch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={testWebhook} disabled={testing || !testChannel}>
                  {testing ? 'Sending...' : 'Send Test'}
                </Button>
              </CardContent>
            </Card>

            {/* Manual Notification for Imported Orders */}
            <Card>
              <CardHeader>
                <CardTitle>Send Manual Notification</CardTitle>
                <CardDescription>
                  Send Discord notification for imported orders (use order name like "15-13759-56842")
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="manual-order">Order Name/Number</Label>
                  <Input
                    id="manual-order"
                    placeholder="e.g., 15-13759-56842"
                    value={manualOrderNumber}
                    onChange={(e) => setManualOrderNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-store">Store Key</Label>
                  <Input
                    id="manual-store"
                    placeholder="e.g., hawaii or las_vegas"
                    value={manualStoreKey}
                    onChange={(e) => setManualStoreKey(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={sendManualNotification} 
                  disabled={sendingManual || !manualOrderNumber || !manualStoreKey}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sendingManual ? 'Sending...' : 'Send Notification'}
                </Button>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/admin')}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
