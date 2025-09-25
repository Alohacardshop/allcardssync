import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Settings, Save, Zap } from "lucide-react";

export function BatchProcessingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false);
  const [autoBatchSize, setAutoBatchSize] = useState(5);
  const [autoDelay, setAutoDelay] = useState(1000);
  const [maxAutoItems, setMaxAutoItems] = useState(100);

  // Load current settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', [
          'BATCH_AUTO_PROCESS_ENABLED',
          'BATCH_AUTO_SIZE',
          'BATCH_AUTO_DELAY',
          'BATCH_AUTO_MAX_ITEMS'
        ]);

      if (error) throw error;

      const settings = data?.reduce((acc, setting) => {
        acc[setting.key_name] = setting.key_value;
        return acc;
      }, {} as Record<string, string>) || {};

      // Set settings with fallbacks
      setAutoProcessEnabled(settings.BATCH_AUTO_PROCESS_ENABLED === 'true');
      setAutoBatchSize(parseInt(settings.BATCH_AUTO_SIZE) || 5);
      setAutoDelay(parseInt(settings.BATCH_AUTO_DELAY) || 1000);
      setMaxAutoItems(parseInt(settings.BATCH_AUTO_MAX_ITEMS) || 100);
    } catch (error) {
      console.error('Error loading batch processing settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        {
          key_name: 'BATCH_AUTO_PROCESS_ENABLED',
          key_value: autoProcessEnabled.toString(),
          description: 'Enable automatic batch processing for inventory sends',
          category: 'batch_processing',
          is_encrypted: false
        },
        {
          key_name: 'BATCH_AUTO_SIZE',
          key_value: autoBatchSize.toString(),
          description: 'Default batch size for auto-processing',
          category: 'batch_processing',
          is_encrypted: false
        },
        {
          key_name: 'BATCH_AUTO_DELAY',
          key_value: autoDelay.toString(),
          description: 'Default delay between chunks for auto-processing (ms)',
          category: 'batch_processing',
          is_encrypted: false
        },
        {
          key_name: 'BATCH_AUTO_MAX_ITEMS',
          key_value: maxAutoItems.toString(),
          description: 'Maximum items for auto-processing (larger batches require manual config)',
          category: 'batch_processing',
          is_encrypted: false
        }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(update, { 
            onConflict: 'key_name',
            ignoreDuplicates: false 
          });
        
        if (error) throw error;
      }

      toast.success('Batch processing settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Batch Processing Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Batch Processing Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            Configure automatic batch processing for sending large inventory batches. 
            When enabled, batches within the size limit will process automatically with safe defaults.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-process">Enable Auto-Processing</Label>
            <p className="text-sm text-muted-foreground">
              Automatically process batches without showing configuration dialog
            </p>
          </div>
          <Switch
            id="auto-process"
            checked={autoProcessEnabled}
            onCheckedChange={setAutoProcessEnabled}
          />
        </div>

        {autoProcessEnabled && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auto-batch-size">Auto-Processing Batch Size</Label>
                <Select value={autoBatchSize.toString()} onValueChange={(value) => setAutoBatchSize(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 item per chunk</SelectItem>
                    <SelectItem value="3">3 items per chunk</SelectItem>
                    <SelectItem value="5">5 items per chunk (recommended)</SelectItem>
                    <SelectItem value="10">10 items per chunk</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Smaller batches are more reliable. 5 items is recommended for auto-processing.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-delay">Auto-Processing Delay</Label>
                <Select value={autoDelay.toString()} onValueChange={(value) => setAutoDelay(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">0.5 seconds</SelectItem>
                    <SelectItem value="1000">1 second (recommended)</SelectItem>
                    <SelectItem value="2000">2 seconds</SelectItem>
                    <SelectItem value="3000">3 seconds</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Delay between processing chunks to prevent API rate limits.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-auto-items">Maximum Auto-Process Items</Label>
                <Select value={maxAutoItems.toString()} onValueChange={(value) => setMaxAutoItems(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 items</SelectItem>
                    <SelectItem value="100">100 items (recommended)</SelectItem>
                    <SelectItem value="200">200 items</SelectItem>
                    <SelectItem value="500">500 items</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Batches larger than this will require manual configuration for safety.
                </p>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                <strong>Auto-Processing Rules:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Small batches (≤20 items): Process immediately</li>
                  <li>• Medium batches (21-{maxAutoItems} items): Auto-process with progress notification</li>
                  <li>• Large batches (&gt;{maxAutoItems} items): Show manual configuration dialog</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}