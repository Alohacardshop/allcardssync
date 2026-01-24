import { useState } from 'react';
import { useAllRegionSettings, RegionSettingRow } from '@/hooks/useRegionSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Globe,
  Palette,
  DollarSign,
  Clock,
  Save,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const REGIONS = [
  { id: 'hawaii', name: 'Hawaii', icon: '🌺' },
  { id: 'las_vegas', name: 'Las Vegas', icon: '🎰' },
];

interface SettingField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'color' | 'json';
  description?: string;
  category: 'branding' | 'ebay' | 'operations';
}

const SETTING_FIELDS: SettingField[] = [
  // Branding
  { key: 'branding.display_name', label: 'Display Name', type: 'text', category: 'branding', description: 'Name shown in the UI' },
  { key: 'branding.icon', label: 'Icon Emoji', type: 'text', category: 'branding', description: 'Emoji icon for this region' },
  { key: 'branding.accent_color', label: 'Accent Color (HSL)', type: 'color', category: 'branding', description: 'Primary accent color in HSL format' },
  { key: 'branding.logo_url', label: 'Logo URL', type: 'text', category: 'branding', description: 'Custom logo image URL' },
  
  // eBay
  { key: 'ebay.default_min_price', label: 'Default Min Price', type: 'number', category: 'ebay', description: 'Minimum price threshold for eBay listings' },
  { key: 'ebay.auto_sync_enabled', label: 'Auto Sync Enabled', type: 'boolean', category: 'ebay', description: 'Automatically sync items to eBay' },
  { key: 'ebay.default_template_id', label: 'Default Template ID', type: 'text', category: 'ebay', description: 'Default listing template UUID' },
  
  // Operations
  { key: 'operations.business_hours', label: 'Business Hours', type: 'json', category: 'operations', description: 'Operating hours configuration' },
];

export function RegionSettingsEditor() {
  const { settingsByRegion, isLoading, updateRegionSetting, refresh } = useAllRegionSettings();
  const [activeRegion, setActiveRegion] = useState('hawaii');
  const [editedValues, setEditedValues] = useState<Record<string, Record<string, any>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const getCurrentValue = (regionId: string, key: string) => {
    // Check edited values first
    if (editedValues[regionId]?.[key] !== undefined) {
      return editedValues[regionId][key];
    }
    // Fall back to database value
    return settingsByRegion[regionId]?.[key];
  };

  const setLocalValue = (regionId: string, key: string, value: any) => {
    setEditedValues(prev => ({
      ...prev,
      [regionId]: {
        ...prev[regionId],
        [key]: value,
      },
    }));
  };

  const saveValue = async (regionId: string, key: string) => {
    const value = editedValues[regionId]?.[key];
    if (value === undefined) return;

    setSavingKey(`${regionId}:${key}`);
    try {
      await updateRegionSetting.mutateAsync({
        regionId,
        key,
        value,
      });
      
      // Clear from edited values
      setEditedValues(prev => {
        const regionEdits = { ...prev[regionId] };
        delete regionEdits[key];
        return { ...prev, [regionId]: regionEdits };
      });
      
      toast.success('Setting saved');
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  const hasUnsavedChanges = (regionId: string, key: string) => {
    return editedValues[regionId]?.[key] !== undefined;
  };

  const renderField = (field: SettingField, regionId: string) => {
    const currentValue = getCurrentValue(regionId, field.key);
    const isEdited = hasUnsavedChanges(regionId, field.key);
    const isSaving = savingKey === `${regionId}:${field.key}`;

    switch (field.type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base">{field.label}</Label>
              {field.description && (
                <p className="text-sm text-muted-foreground">{field.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={currentValue ?? false}
                onCheckedChange={(checked) => {
                  setLocalValue(regionId, field.key, checked);
                }}
              />
              {isEdited && (
                <Button
                  size="sm"
                  onClick={() => saveValue(regionId, field.key)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </Button>
              )}
            </div>
          </div>
        );

      case 'number':
        return (
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${regionId}-${field.key}`}>{field.label}</Label>
              {isEdited && (
                <Button
                  size="sm"
                  onClick={() => saveValue(regionId, field.key)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              )}
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <Input
              id={`${regionId}-${field.key}`}
              type="number"
              value={currentValue ?? ''}
              onChange={(e) => setLocalValue(regionId, field.key, parseFloat(e.target.value) || 0)}
              className={isEdited ? 'border-primary' : ''}
            />
          </div>
        );

      case 'color':
        return (
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${regionId}-${field.key}`}>{field.label}</Label>
              {isEdited && (
                <Button
                  size="sm"
                  onClick={() => saveValue(regionId, field.key)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              )}
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <div className="flex gap-2">
              <Input
                id={`${regionId}-${field.key}`}
                value={currentValue ?? ''}
                onChange={(e) => setLocalValue(regionId, field.key, e.target.value)}
                className={`flex-1 ${isEdited ? 'border-primary' : ''}`}
                placeholder="hsl(174, 62%, 47%)"
              />
              <div 
                className="w-10 h-10 rounded border"
                style={{ backgroundColor: currentValue || '#888' }}
              />
            </div>
          </div>
        );

      case 'json':
        return (
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${regionId}-${field.key}`}>{field.label}</Label>
              {isEdited && (
                <Button
                  size="sm"
                  onClick={() => saveValue(regionId, field.key)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              )}
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <textarea
              id={`${regionId}-${field.key}`}
              value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : currentValue ?? ''}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setLocalValue(regionId, field.key, parsed);
                } catch {
                  // Keep as string if invalid JSON
                  setLocalValue(regionId, field.key, e.target.value);
                }
              }}
              className={`w-full h-24 p-2 font-mono text-sm border rounded-md ${isEdited ? 'border-primary' : ''}`}
            />
          </div>
        );

      default:
        return (
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${regionId}-${field.key}`}>{field.label}</Label>
              {isEdited && (
                <Button
                  size="sm"
                  onClick={() => saveValue(regionId, field.key)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              )}
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <Input
              id={`${regionId}-${field.key}`}
              value={currentValue ?? ''}
              onChange={(e) => setLocalValue(regionId, field.key, e.target.value)}
              className={isEdited ? 'border-primary' : ''}
            />
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Region Settings
            </CardTitle>
            <CardDescription>
              Configure region-specific branding, eBay defaults, and operational settings
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeRegion} onValueChange={setActiveRegion}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            {REGIONS.map((region) => (
              <TabsTrigger key={region.id} value={region.id} className="flex items-center gap-2">
                <span>{region.icon}</span>
                {region.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {REGIONS.map((region) => (
            <TabsContent key={region.id} value={region.id} className="mt-6">
              <div className="space-y-4">
                {/* Preview Card */}
                <Card className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="text-2xl">{getCurrentValue(region.id, 'branding.icon') || region.icon}</span>
                      {getCurrentValue(region.id, 'branding.display_name') || `Aloha Cards ${region.name}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <Badge 
                        style={{ 
                          backgroundColor: getCurrentValue(region.id, 'branding.accent_color') || '#888',
                          color: 'white'
                        }}
                      >
                        Accent Color Preview
                      </Badge>
                      {getCurrentValue(region.id, 'branding.logo_url') && (
                        <img 
                          src={getCurrentValue(region.id, 'branding.logo_url')} 
                          alt="Logo" 
                          className="h-8 object-contain"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Settings Accordion */}
                <Accordion type="multiple" defaultValue={['branding', 'ebay', 'operations']}>
                  <AccordionItem value="branding">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        Branding
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {SETTING_FIELDS.filter(f => f.category === 'branding').map((field) => (
                        <div key={field.key}>
                          {renderField(field, region.id)}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="ebay">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        eBay Defaults
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {SETTING_FIELDS.filter(f => f.category === 'ebay').map((field) => (
                        <div key={field.key}>
                          {renderField(field, region.id)}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="operations">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Operations
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {SETTING_FIELDS.filter(f => f.category === 'operations').map((field) => (
                        <div key={field.key}>
                          {renderField(field, region.id)}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
