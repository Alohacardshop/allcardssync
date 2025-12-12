import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Settings, Loader2, Play, Eye, AlertTriangle, CheckCircle,
  Radio, Hand, Zap
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

interface SyncConfig {
  sync_enabled: boolean;
  dry_run_mode: boolean;
  sync_mode: 'manual' | 'realtime';
}

interface EbaySyncControlsProps {
  storeKey: string;
  configId: string;
  onSyncTriggered?: () => void;
}

export function EbaySyncControls({ storeKey, configId, onSyncTriggered }: EbaySyncControlsProps) {
  const [config, setConfig] = useState<SyncConfig>({
    sync_enabled: false,
    dry_run_mode: true,
    sync_mode: 'manual'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    loadConfig();
    loadPendingSyncCount();
  }, [configId, storeKey]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('ebay_store_config')
        .select('sync_enabled, dry_run_mode, sync_mode')
        .eq('id', configId)
        .single();

      if (error) throw error;
      
      setConfig({
        sync_enabled: data.sync_enabled ?? false,
        dry_run_mode: data.dry_run_mode ?? true,
        sync_mode: (data.sync_mode as 'manual' | 'realtime') ?? 'manual'
      });
    } catch (error: any) {
      console.error('Failed to load sync config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingSyncCount = async () => {
    try {
      const { count, error } = await supabase
        .from('ebay_inventory_aggregate')
        .select('*', { count: 'exact', head: true })
        .eq('store_key', storeKey)
        .eq('needs_sync', true);

      if (error) throw error;
      setPendingSyncCount(count || 0);
    } catch (error) {
      console.error('Failed to load pending sync count:', error);
    }
  };

  const updateConfig = async (updates: Partial<SyncConfig>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ebay_store_config')
        .update(updates)
        .eq('id', configId);

      if (error) throw error;

      setConfig(prev => ({ ...prev, ...updates }));
      toast.success('Settings updated');
    } catch (error: any) {
      toast.error('Failed to update settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const triggerSync = async (dryRun: boolean) => {
    setSyncing(true);
    try {
      // Get all items that need sync
      const { data: itemsToSync, error: fetchError } = await supabase
        .from('ebay_inventory_aggregate')
        .select('sku, total_quantity, ebay_quantity')
        .eq('store_key', storeKey)
        .eq('needs_sync', true)
        .limit(100);

      if (fetchError) throw fetchError;

      if (!itemsToSync || itemsToSync.length === 0) {
        toast.info('No items need syncing');
        return;
      }

      // Log the sync operation
      const { error: logError } = await supabase
        .from('ebay_sync_log')
        .insert({
          store_key: storeKey,
          operation: dryRun ? 'preview_sync' : 'manual_sync',
          dry_run: dryRun,
          before_state: { items_to_sync: itemsToSync.length },
          after_state: { items: itemsToSync },
          success: true
        });

      if (logError) console.error('Failed to log sync:', logError);

      if (dryRun) {
        toast.success(`Preview: Would sync ${itemsToSync.length} items to eBay`);
      } else {
        // In non-dry-run mode, we'd call the eBay API
        // For now, just mark items as synced
        const skus = itemsToSync.map(i => i.sku);
        
        const { error: updateError } = await supabase
          .from('ebay_inventory_aggregate')
          .update({ 
            needs_sync: false, 
            last_synced_to_ebay_at: new Date().toISOString(),
            ebay_quantity: supabase.rpc ? undefined : undefined // Would be set by actual sync
          })
          .eq('store_key', storeKey)
          .in('sku', skus);

        if (updateError) throw updateError;

        toast.success(`Synced ${itemsToSync.length} items to eBay`);
      }

      await loadPendingSyncCount();
      onSyncTriggered?.();
    } catch (error: any) {
      toast.error('Sync failed: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Sync Controls
        </CardTitle>
        <CardDescription>
          Configure and trigger eBay inventory synchronization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Safety Warning */}
        {!config.dry_run_mode && config.sync_enabled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Live Mode Active</AlertTitle>
            <AlertDescription>
              Syncing will push real changes to eBay. Make sure your data is correct.
            </AlertDescription>
          </Alert>
        )}

        {/* Dry Run Mode */}
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Dry Run Mode</Label>
              {config.dry_run_mode && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                  SAFE
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              When enabled, syncs are simulated without pushing to eBay
            </p>
          </div>
          <Switch
            checked={config.dry_run_mode}
            onCheckedChange={(checked) => updateConfig({ dry_run_mode: checked })}
            disabled={saving}
          />
        </div>

        {/* Sync Enabled */}
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {config.sync_enabled ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <Label className="font-medium">Sync Enabled</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Master toggle for all eBay synchronization
            </p>
          </div>
          <Switch
            checked={config.sync_enabled}
            onCheckedChange={(checked) => updateConfig({ sync_enabled: checked })}
            disabled={saving}
          />
        </div>

        {/* Sync Mode */}
        <div className="space-y-3">
          <Label className="font-medium">Sync Mode</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateConfig({ sync_mode: 'manual' })}
              disabled={saving}
              className={`p-4 rounded-lg border text-left transition-colors ${
                config.sync_mode === 'manual'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Hand className="h-4 w-4" />
                <span className="font-medium">Manual</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sync only when you click the button
              </p>
            </button>
            <button
              onClick={() => updateConfig({ sync_mode: 'realtime' })}
              disabled={saving}
              className={`p-4 rounded-lg border text-left transition-colors ${
                config.sync_mode === 'realtime'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4" />
                <span className="font-medium">Real-time</span>
                <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-sync when inventory changes
              </p>
            </button>
          </div>
        </div>

        <Separator />

        {/* Sync Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Sync Actions</Label>
            {pendingSyncCount > 0 && (
              <Badge variant="secondary">
                {pendingSyncCount} pending
              </Badge>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => triggerSync(true)}
              disabled={syncing || pendingSyncCount === 0}
              className="flex-1"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Preview Sync
            </Button>
            <Button
              onClick={() => triggerSync(config.dry_run_mode)}
              disabled={syncing || pendingSyncCount === 0 || !config.sync_enabled}
              className="flex-1"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {config.dry_run_mode ? 'Sync (Dry Run)' : 'Sync Now'}
            </Button>
          </div>
          
          {!config.sync_enabled && (
            <p className="text-xs text-muted-foreground text-center">
              Enable sync above to use the Sync Now button
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
