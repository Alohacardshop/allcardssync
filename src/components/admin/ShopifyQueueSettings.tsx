import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"
import { Settings, Save, RotateCcw, AlertTriangle } from "lucide-react"
import { logger } from '@/lib/logger';

interface QueueSettings {
  batchSize: number
  batchDelay: number
  maxProcessCount: number
  autoCleanupDays: number
  autoArchiveDays: number
  healthCheckInterval: number
  enableEmailAlerts: boolean
  failureThreshold: number
}

export default function ShopifyQueueSettings() {
  const [settings, setSettings] = useState<QueueSettings>({
    batchSize: 1,
    batchDelay: 2000,
    maxProcessCount: 50,
    autoCleanupDays: 7,
    autoArchiveDays: 30,
    healthCheckInterval: 10,
    enableEmailAlerts: false,
    failureThreshold: 10
  })
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', [
          'SHOPIFY_BATCH_SIZE',
          'SHOPIFY_BATCH_DELAY',
          'SHOPIFY_MAX_PROCESS_COUNT',
          'SHOPIFY_AUTO_CLEANUP_DAYS',
          'SHOPIFY_AUTO_ARCHIVE_DAYS',
          'SHOPIFY_HEALTH_CHECK_INTERVAL',
          'SHOPIFY_EMAIL_ALERTS',
          'SHOPIFY_FAILURE_THRESHOLD'
        ])

      if (error) throw error

      const settingsMap = data?.reduce((acc: any, setting) => {
        acc[setting.key_name] = setting.key_value
        return acc
      }, {}) || {}

      setSettings({
        batchSize: parseInt(settingsMap.SHOPIFY_BATCH_SIZE || '1'),
        batchDelay: parseInt(settingsMap.SHOPIFY_BATCH_DELAY || '2000'),
        maxProcessCount: parseInt(settingsMap.SHOPIFY_MAX_PROCESS_COUNT || '50'),
        autoCleanupDays: parseInt(settingsMap.SHOPIFY_AUTO_CLEANUP_DAYS || '7'),
        autoArchiveDays: parseInt(settingsMap.SHOPIFY_AUTO_ARCHIVE_DAYS || '30'),
        healthCheckInterval: parseInt(settingsMap.SHOPIFY_HEALTH_CHECK_INTERVAL || '10'),
        enableEmailAlerts: settingsMap.SHOPIFY_EMAIL_ALERTS === 'true',
        failureThreshold: parseInt(settingsMap.SHOPIFY_FAILURE_THRESHOLD || '10')
      })
    } catch (error) {
      logger.error('Error loading settings', error instanceof Error ? error : new Error(String(error)), undefined, 'shopify-queue-settings');
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const settingsToSave = [
        { key_name: 'SHOPIFY_BATCH_SIZE', key_value: settings.batchSize.toString() },
        { key_name: 'SHOPIFY_BATCH_DELAY', key_value: settings.batchDelay.toString() },
        { key_name: 'SHOPIFY_MAX_PROCESS_COUNT', key_value: settings.maxProcessCount.toString() },
        { key_name: 'SHOPIFY_AUTO_CLEANUP_DAYS', key_value: settings.autoCleanupDays.toString() },
        { key_name: 'SHOPIFY_AUTO_ARCHIVE_DAYS', key_value: settings.autoArchiveDays.toString() },
        { key_name: 'SHOPIFY_HEALTH_CHECK_INTERVAL', key_value: settings.healthCheckInterval.toString() },
        { key_name: 'SHOPIFY_EMAIL_ALERTS', key_value: settings.enableEmailAlerts.toString() },
        { key_name: 'SHOPIFY_FAILURE_THRESHOLD', key_value: settings.failureThreshold.toString() }
      ]

      for (const setting of settingsToSave) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(setting, { onConflict: 'key_name' })

        if (error) throw error
      }

      toast.success('Settings saved successfully')
    } catch (error) {
      logger.error('Error saving settings', error instanceof Error ? error : new Error(String(error)), undefined, 'shopify-queue-settings');
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = () => {
    setSettings({
      batchSize: 1,
      batchDelay: 2000,
      maxProcessCount: 50,
      autoCleanupDays: 7,
      autoArchiveDays: 30,
      healthCheckInterval: 10,
      enableEmailAlerts: false,
      failureThreshold: 10
    })
  }

  if (loading) {
    return <div className="text-center py-4">Loading settings...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Queue Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure Shopify sync performance and safety settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Defaults
          </Button>
          <Button onClick={saveSettings} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Processing Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Configuration</CardTitle>
            <CardDescription>
              Control how many items are processed and how fast
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batchSize">Items per Batch</Label>
              <Select 
                value={settings.batchSize.toString()} 
                onValueChange={(value) => setSettings(prev => ({ ...prev, batchSize: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 item (Safest)</SelectItem>
                  <SelectItem value="3">3 items</SelectItem>
                  <SelectItem value="5">5 items (Fastest)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Higher values process faster but use more API calls
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="batchDelay">Delay Between Batches (ms)</Label>
              <Input
                id="batchDelay"
                type="number"
                min="1000"
                max="10000"
                step="500"
                value={settings.batchDelay}
                onChange={(e) => setSettings(prev => ({ ...prev, batchDelay: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 2000ms (2 seconds) to avoid rate limits
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxProcessCount">Max Items per Run</Label>
              <Input
                id="maxProcessCount"
                type="number"
                min="10"
                max="200"
                value={settings.maxProcessCount}
                onChange={(e) => setSettings(prev => ({ ...prev, maxProcessCount: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Prevents runaway processing jobs
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Queue Maintenance</CardTitle>
            <CardDescription>
              Automatic cleanup and archiving settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="autoCleanupDays">Auto-Delete Completed Items (days)</Label>
              <Input
                id="autoCleanupDays"
                type="number"
                min="1"
                max="30"
                value={settings.autoCleanupDays}
                onChange={(e) => setSettings(prev => ({ ...prev, autoCleanupDays: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Completed items older than this will be deleted
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoArchiveDays">Archive Failed Items (days)</Label>
              <Input
                id="autoArchiveDays"
                type="number"
                min="7"
                max="90"
                value={settings.autoArchiveDays}
                onChange={(e) => setSettings(prev => ({ ...prev, autoArchiveDays: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Failed items will be archived after this period
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Health Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle>Health Monitoring</CardTitle>
            <CardDescription>
              Queue health checks and alerting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="healthCheckInterval">Health Check Interval (minutes)</Label>
              <Input
                id="healthCheckInterval"
                type="number"
                min="5"
                max="60"
                value={settings.healthCheckInterval}
                onChange={(e) => setSettings(prev => ({ ...prev, healthCheckInterval: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                How often to check if the queue processor is running
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="failureThreshold">Failure Rate Threshold (%)</Label>
              <Input
                id="failureThreshold"
                type="number"
                min="1"
                max="50"
                value={settings.failureThreshold}
                onChange={(e) => setSettings(prev => ({ ...prev, failureThreshold: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Alert when failure rate exceeds this percentage
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="emailAlerts">Email Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Send email notifications for critical queue issues
                </p>
              </div>
              <Switch
                id="emailAlerts"
                checked={settings.enableEmailAlerts}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enableEmailAlerts: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Safety Notice */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-800">Safety Recommendations</h4>
                <ul className="text-sm text-amber-700 mt-1 space-y-1">
                  <li>• Start with 1 item per batch and 2-second delays</li>
                  <li>• Monitor API usage in the dashboard</li>
                  <li>• Enable email alerts for production environments</li>
                  <li>• Test changes with small batches first</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}