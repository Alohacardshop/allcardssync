import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, AlertCircle, CheckCircle } from "lucide-react";

export function InventorySyncSettings() {
  const [syncMode, setSyncMode] = useState<'auto' | 'manual'>('manual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSyncMode = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'INVENTORY_SYNC_MODE')
        .maybeSingle();

      if (error) throw error;
      
      setSyncMode(data?.key_value === 'auto' ? 'auto' : 'manual');
    } catch (error) {
      console.error('Failed to load sync mode:', error);
      toast.error('Failed to load inventory sync settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSyncMode = async (mode: 'auto' | 'manual') => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key_name: 'INVENTORY_SYNC_MODE',
          key_value: mode,
          description: 'Controls automatic Shopify inventory synchronization',
          category: 'shopify'
        });

      if (error) throw error;
      
      setSyncMode(mode);
      toast.success(`Inventory sync mode set to ${mode}`);
    } catch (error) {
      console.error('Failed to save sync mode:', error);
      toast.error('Failed to save inventory sync settings');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadSyncMode();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventory Sync Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Inventory Sync Settings
          <Badge variant={syncMode === 'auto' ? 'default' : 'secondary'}>
            {syncMode === 'auto' ? 'Auto' : 'Manual'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-sync">Automatic Shopify Sync</Label>
            <div className="text-sm text-muted-foreground">
              When enabled, inventory changes automatically sync to Shopify
            </div>
          </div>
          <Switch
            id="auto-sync"
            checked={syncMode === 'auto'}
            onCheckedChange={(checked) => saveSyncMode(checked ? 'auto' : 'manual')}
            disabled={saving}
          />
        </div>

        {syncMode === 'auto' ? (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Automatic sync is enabled.</strong> All inventory changes will be 
              automatically synchronized to Shopify in real-time. The system will also 
              listen for inventory updates from Shopify webhooks.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Manual sync mode is active.</strong> Inventory changes will not 
              automatically sync to Shopify. Use the "Sync to Shopify" buttons on the 
              Inventory page to manually sync items.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="text-sm font-medium">Sync Behavior:</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>Items are only synced when moved to inventory (removed from batch)</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>Quantity changes in inventory automatically update Shopify (when auto mode is enabled)</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div>Shopify inventory updates are received via webhooks and tracked in the system</div>
            </div>
          </div>
        </div>

        <Button 
          variant="outline" 
          onClick={loadSyncMode}
          disabled={loading || saving}
          className="w-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Settings
        </Button>
      </CardContent>
    </Card>
  );
}