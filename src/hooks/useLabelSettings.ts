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
  speed: number; // IPS (inches per second)
  darkness: number; // 1-30 scale
  copies: number;
  cutMode: 'none' | 'every-label' | 'end-of-job';
}

const DEFAULT_SETTINGS: LabelSettings = {
  printerIp: '',
  printerPort: 9100,
  hasCutter: false,
  dpi: 203,
  speed: 4, // 4 IPS is a common default
  darkness: 15, // Mid-range darkness
  copies: 1,
  cutMode: 'end-of-job' // Default to end-of-job if cutter available
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

  // Load settings from localStorage only for now (database types not available yet)
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings) as LabelSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
      setSettings(DEFAULT_SETTINGS);
    }
    
    setIsLoading(false);
  }, []);

  // Save settings to localStorage only for now 
  const saveSettings = useCallback(async (newSettings: Partial<LabelSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSettings));
    
    // NOTE: Database persistence not implemented yet - using localStorage only
    // Future: Add workstation_settings table for multi-device sync
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