import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BatchConfig } from "@/hooks/useBatchSendToShopify";
import { logger } from '@/lib/logger';

export interface AutoProcessSettings {
  enabled: boolean;
  batchSize: number;
  delay: number;
  maxItems: number;
}

export function useBatchAutoProcessSettings() {
  const [settings, setSettings] = useState<AutoProcessSettings>({
    enabled: false,
    batchSize: 5,
    delay: 1000,
    maxItems: 100
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
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

      const settingsMap = data?.reduce((acc, setting) => {
        acc[setting.key_name] = setting.key_value;
        return acc;
      }, {} as Record<string, string>) || {};

      setSettings({
        enabled: settingsMap.BATCH_AUTO_PROCESS_ENABLED === 'true',
        batchSize: parseInt(settingsMap.BATCH_AUTO_SIZE) || 5,
        delay: parseInt(settingsMap.BATCH_AUTO_DELAY) || 1000,
        maxItems: parseInt(settingsMap.BATCH_AUTO_MAX_ITEMS) || 100
      });
    } catch (error) {
      logger.error('Failed to load auto-process settings', error instanceof Error ? error : new Error(String(error)), {}, 'batch-auto-process');
    } finally {
      setLoading(false);
    }
  };

  const getAutoProcessConfig = (): BatchConfig => ({
    batchSize: settings.batchSize,
    delayBetweenChunks: settings.delay,
    failFast: false // Always use safe defaults for auto-processing
  });

  const shouldAutoProcess = (itemCount: number): boolean => {
    return settings.enabled && itemCount <= settings.maxItems;
  };

  const getProcessingMode = (itemCount: number): 'immediate' | 'auto' | 'manual' => {
    if (!settings.enabled) return 'manual';
    if (itemCount <= 20) return 'immediate';
    if (itemCount <= settings.maxItems) return 'auto';
    return 'manual';
  };

  return {
    settings,
    loading,
    getAutoProcessConfig,
    shouldAutoProcess,
    getProcessingMode,
    refreshSettings: loadSettings
  };
}