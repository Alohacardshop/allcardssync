import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Settings, Save, RotateCcw, Zap, Shield, Bell } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface ConfigItem {
  id: string
  key: string
  value: string
  description?: string
  category: string
}

export const SyncConfiguration = () => {
  const [configs, setConfigs] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    try {
      // Use mock configuration data for now until types are updated
      const mockConfigs: ConfigItem[] = [
        {
          id: '1',
          key: 'batch_size_cards',
          value: '25',
          description: 'Default batch size for card processing',
          category: 'performance'
        },
        {
          id: '2',
          key: 'batch_size_sets',
          value: '10',
          description: 'Default batch size for set processing',
          category: 'performance'
        },
        {
          id: '3',
          key: 'api_rate_limit_ms',
          value: '100',
          description: 'Minimum delay between API calls in milliseconds',
          category: 'performance'
        },
        {
          id: '4',
          key: 'max_retries',
          value: '3',
          description: 'Maximum number of retries for failed operations',
          category: 'reliability'
        },
        {
          id: '5',
          key: 'webhook_timeout_seconds',
          value: '10',
          description: 'Timeout for webhook requests in seconds',
          category: 'webhooks'
        }
      ]

      setConfigs(mockConfigs)
    } catch (error) {
      console.error('Failed to load configs:', error)
      toast({
        title: "Failed to load configuration",
        description: "Unable to fetch sync configuration settings",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = async (key: string, value: string) => {
    try {
      setSaving(true)
      // Mock update for now - would use RPC call when types are available
      setConfigs(prev => prev.map(config => 
        config.key === key ? { ...config, value } : config
      ))

      toast({
        title: "Configuration updated",
        description: `Successfully updated ${key}`,
      })
    } catch (error) {
      console.error('Failed to update config:', error)
      toast({
        title: "Update failed",
        description: "Failed to update configuration",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    try {
      setSaving(true)
      // Reset all to default values - this would need a proper implementation
      toast({
        title: "Reset to defaults",
        description: "All settings reset to default values",
      })
      loadConfigs()
    } catch (error) {
      console.error('Failed to reset configs:', error)
    } finally {
      setSaving(false)
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'performance': return <Zap className="h-4 w-4" />
      case 'reliability': return <Shield className="h-4 w-4" />
      case 'webhooks': return <Bell className="h-4 w-4" />
      default: return <Settings className="h-4 w-4" />
    }
  }

  const groupedConfigs = configs.reduce((acc, config) => {
    if (!acc[config.category]) acc[config.category] = []
    acc[config.category].push(config)
    return acc
  }, {} as Record<string, ConfigItem[]>)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sync Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Sync Configuration
              </CardTitle>
              <CardDescription>
                Configure performance, reliability, and notification settings
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              onClick={resetToDefaults}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                {getCategoryIcon(category)}
                <h3 className="text-lg font-semibold capitalize">{category}</h3>
                <Badge variant="secondary" className="text-xs">
                  {categoryConfigs.length} settings
                </Badge>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                {categoryConfigs.map((config) => (
                  <div key={config.key} className="space-y-2">
                    <Label htmlFor={config.key} className="text-sm font-medium">
                      {config.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Label>
                    <Input
                      id={config.key}
                      value={config.value}
                      onChange={(e) => {
                        setConfigs(prev => prev.map(c => 
                          c.key === config.key ? { ...c, value: e.target.value } : c
                        ))
                      }}
                      onBlur={(e) => updateConfig(config.key, e.target.value)}
                      disabled={saving}
                      className="text-sm"
                    />
                    {config.description && (
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              
              <Separator className="mt-6" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}