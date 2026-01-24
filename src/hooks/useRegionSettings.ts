import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useMemo } from 'react';

export interface RegionSettingRow {
  id: string;
  region_id: string;
  setting_key: string;
  setting_value: any;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegionSettings {
  // Branding
  'branding.accent_color': string;
  'branding.icon': string;
  'branding.display_name': string;
  'branding.logo_url'?: string;
  
  // eBay defaults
  'ebay.default_min_price': number;
  'ebay.auto_sync_enabled': boolean;
  'ebay.default_template_id'?: string;
  
  // Operations
  'operations.business_hours': {
    start: number;
    end: number;
    timezone: string;
  };
}

/**
 * Hook to fetch and manage region-specific settings
 * Returns typed settings for the current user's assigned region
 */
export function useRegionSettings() {
  const { assignedRegion } = useStore();
  const queryClient = useQueryClient();
  
  const regionId = assignedRegion || 'hawaii';
  
  const { data: rawSettings, isLoading, error } = useQuery({
    queryKey: ['region-settings', regionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('region_settings')
        .select('*')
        .eq('region_id', regionId);
      
      if (error) throw error;
      return data as RegionSettingRow[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Transform array to object for easy access
  const settings = useMemo(() => {
    if (!rawSettings) return null;
    
    const settingsObject: Record<string, any> = {};
    rawSettings.forEach((row) => {
      settingsObject[row.setting_key] = row.setting_value;
    });
    
    return settingsObject as Partial<RegionSettings>;
  }, [rawSettings]);

  // Update a specific setting
  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { data, error } = await supabase
        .from('region_settings')
        .upsert({
          region_id: regionId,
          setting_key: key,
          setting_value: value,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'region_id,setting_key',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['region-settings', regionId] });
    },
  });

  // Convenience getters with defaults
  const accentColor = settings?.['branding.accent_color'] || (regionId === 'hawaii' ? 'hsl(174, 62%, 47%)' : 'hsl(45, 93%, 47%)');
  const icon = settings?.['branding.icon'] || (regionId === 'hawaii' ? '🌺' : '🎰');
  const displayName = settings?.['branding.display_name'] || (regionId === 'hawaii' ? 'Aloha Cards Hawaii' : 'Aloha Cards Las Vegas');
  const logoUrl = settings?.['branding.logo_url'] || null;
  
  const ebayDefaultMinPrice = settings?.['ebay.default_min_price'] || 25;
  const ebayAutoSyncEnabled = settings?.['ebay.auto_sync_enabled'] || false;
  const ebayDefaultTemplateId = settings?.['ebay.default_template_id'] || null;
  
  const businessHours = settings?.['operations.business_hours'] || {
    start: 10,
    end: 19,
    timezone: regionId === 'hawaii' ? 'Pacific/Honolulu' : 'America/Los_Angeles',
  };

  return {
    regionId,
    settings,
    rawSettings,
    isLoading,
    error,
    updateSetting,
    
    // Typed convenience accessors
    accentColor,
    icon,
    displayName,
    logoUrl,
    ebayDefaultMinPrice,
    ebayAutoSyncEnabled,
    ebayDefaultTemplateId,
    businessHours,
    
    // Invalidate cache
    refresh: () => queryClient.invalidateQueries({ queryKey: ['region-settings', regionId] }),
  };
}

/**
 * Hook to fetch all regions' settings (for admin)
 */
export function useAllRegionSettings() {
  const queryClient = useQueryClient();
  
  const { data: allSettings, isLoading, error } = useQuery({
    queryKey: ['region-settings-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('region_settings')
        .select('*')
        .order('region_id', { ascending: true })
        .order('setting_key', { ascending: true });
      
      if (error) throw error;
      return data as RegionSettingRow[];
    },
  });

  // Group by region
  const settingsByRegion = useMemo(() => {
    if (!allSettings) return {};
    
    const grouped: Record<string, Record<string, any>> = {};
    allSettings.forEach((row) => {
      if (!grouped[row.region_id]) {
        grouped[row.region_id] = {};
      }
      grouped[row.region_id][row.setting_key] = row.setting_value;
    });
    
    return grouped;
  }, [allSettings]);

  // Update a setting for a specific region
  const updateRegionSetting = useMutation({
    mutationFn: async ({ regionId, key, value, description }: { 
      regionId: string; 
      key: string; 
      value: any;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from('region_settings')
        .upsert({
          region_id: regionId,
          setting_key: key,
          setting_value: value,
          description: description || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'region_id,setting_key',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['region-settings-all'] });
      queryClient.invalidateQueries({ queryKey: ['region-settings'] });
    },
  });

  // Delete a setting
  const deleteSetting = useMutation({
    mutationFn: async ({ regionId, key }: { regionId: string; key: string }) => {
      const { error } = await supabase
        .from('region_settings')
        .delete()
        .eq('region_id', regionId)
        .eq('setting_key', key);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['region-settings-all'] });
      queryClient.invalidateQueries({ queryKey: ['region-settings'] });
    },
  });

  return {
    allSettings,
    settingsByRegion,
    isLoading,
    error,
    updateRegionSetting,
    deleteSetting,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['region-settings-all'] }),
  };
}
