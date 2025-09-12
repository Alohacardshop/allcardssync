import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Dpi } from '@/lib/zpl';

export interface LabelSettings {
  // Printer settings
  printerIp: string;
  printerPort: number;
  hasCutter: boolean;
  
  // Print settings
  dpi: Dpi;
  speed: number;
  darkness: number;
  copies: number;
  cutMode: 'none' | 'every-label' | 'end-of-job';
}

const DEFAULT_SETTINGS: LabelSettings = {
  printerIp: '',
  printerPort: 9100,
  hasCutter: false,
  dpi: 203,
  speed: 4,
  darkness: 10,
  copies: 1,
  cutMode: 'end-of-job'
};

const STORAGE_KEY = 'label-settings';

export function useLabelSettings() {
  const [settings, setSettings] = useState<LabelSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Get workstation ID for database storage
  const getWorkstationId = () => {
    let id = localStorage.getItem('workstation-id');
    if (!id) {
      id = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', id);
    }
    return id;
  };

  // Load settings from database first, then localStorage
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Try database first
      const workstationId = getWorkstationId();
      const { data: dbSettings } = await supabase
        .from('label_settings')
        .select('*')
        .eq('workstation_id', workstationId)
        .order('updated_at', { ascending: false })
        .maybeSingle();
      
      if (dbSettings) {
        const loadedSettings: LabelSettings = {
          printerIp: dbSettings.printer_ip || DEFAULT_SETTINGS.printerIp,
          printerPort: dbSettings.printer_port || DEFAULT_SETTINGS.printerPort,
          hasCutter: dbSettings.has_cutter ?? DEFAULT_SETTINGS.hasCutter,
          dpi: (dbSettings.dpi as Dpi) || DEFAULT_SETTINGS.dpi,
          speed: dbSettings.speed || DEFAULT_SETTINGS.speed,
          darkness: dbSettings.darkness || DEFAULT_SETTINGS.darkness,
          copies: dbSettings.copies || DEFAULT_SETTINGS.copies,
          cutMode: (dbSettings.cut_mode as LabelSettings['cutMode']) || DEFAULT_SETTINGS.cutMode
        };
        setSettings(loadedSettings);
        
        // Sync to localStorage for consistency
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedSettings));
        return;
      }
    } catch (error) {
      console.log('No database settings found, checking localStorage');
    }

    // Fallback to localStorage
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings) as LabelSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
      setSettings(DEFAULT_SETTINGS);
    }
    
    setIsLoading(false);
  }, []);

  // Save settings to both localStorage and database
  const saveSettings = useCallback(async (newSettings: Partial<LabelSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    
    // Save to localStorage immediately
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSettings));
    
    // Save to database (async, non-blocking)
    try {
      const workstationId = getWorkstationId();
      await supabase
        .from('label_settings')
        .upsert({
          workstation_id: workstationId,
          printer_ip: updatedSettings.printerIp,
          printer_port: updatedSettings.printerPort,
          has_cutter: updatedSettings.hasCutter,
          dpi: updatedSettings.dpi,
          speed: updatedSettings.speed,
          darkness: updatedSettings.darkness,
          copies: updatedSettings.copies,
          cut_mode: updatedSettings.cutMode,
        }, {
          onConflict: 'workstation_id'
        });
    } catch (error) {
      console.log('Could not sync settings to database:', error);
      // Non-blocking - settings are still saved to localStorage
    }
  }, [settings]);

  // Initialize on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Helper functions
  const updatePrinterSettings = useCallback((printerSettings: Partial<Pick<LabelSettings, 'printerIp' | 'printerPort' | 'hasCutter'>>) => {
    saveSettings(printerSettings);
  }, [saveSettings]);

  const updatePrintSettings = useCallback((printSettings: Partial<Pick<LabelSettings, 'dpi' | 'speed' | 'darkness' | 'copies' | 'cutMode'>>) => {
    saveSettings(printSettings);
  }, [saveSettings]);

  return {
    settings,
    isLoading,
    saveSettings,
    updatePrinterSettings,
    updatePrintSettings,
    loadSettings
  };
}