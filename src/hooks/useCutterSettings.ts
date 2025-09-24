import { useState, useEffect, useCallback } from 'react';

export type CutMode = 'per_label' | 'batch';

export interface CutterSettings {
  cutMode: CutMode;
  enableCutter: boolean;
}

const DEFAULT_SETTINGS: CutterSettings = {
  cutMode: 'batch',
  enableCutter: true
};

const STORAGE_KEY = 'cutter-settings';

/**
 * Hook to manage cutter settings with localStorage persistence
 */
export function useCutterSettings() {
  const [settings, setSettings] = useState<CutterSettings>(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CutterSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.warn('Failed to load cutter settings:', error);
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<CutterSettings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save cutter settings:', error);
    }
  }, [settings]);

  const updateCutMode = useCallback((cutMode: CutMode) => {
    saveSettings({ cutMode });
  }, [saveSettings]);

  const updateEnableCutter = useCallback((enableCutter: boolean) => {
    saveSettings({ enableCutter });
  }, [saveSettings]);

  return {
    settings,
    updateCutMode,
    updateEnableCutter,
    saveSettings
  };
}

/**
 * Generate ZPL cutter commands based on settings
 */
export function generateCutterCommands(settings: CutterSettings): {
  setupCommands: string[];
  cutCommand: string;
} {
  if (!settings.enableCutter) {
    return {
      setupCommands: [],
      cutCommand: ''
    };
  }

  const setupCommands = [
    '^MMC',  // Set print mode = Cutter
    '^CN1'   // Enable cutter
  ];

  let cutCommand = '';
  if (settings.cutMode === 'per_label') {
    cutCommand = '^MCY';  // Cut after every label
  } else {
    cutCommand = '^MCN';  // Cut only after batch completion
  }

  return {
    setupCommands,
    cutCommand
  };
}

/**
 * Generate immediate cut command ZPL
 */
export function generateImmediateCutZPL(): string {
  return '^XA^MMC^CN1^MCY^XZ';
}