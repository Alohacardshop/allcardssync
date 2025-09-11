import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RawIntakeSettings {
  defaultGame: string;
  enabledGames: string[];
}

export function useRawIntakeSettings() {
  const [settings, setSettings] = useState<RawIntakeSettings>({
    defaultGame: 'pokemon',
    enabledGames: ['pokemon']
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
        .in('key_name', ['RAW_INTAKE_DEFAULT_GAME', 'RAW_INTAKE_ENABLED_GAMES']);

      if (error) throw error;

      const settingsMap = data?.reduce((acc, setting) => {
        acc[setting.key_name] = setting.key_value;
        return acc;
      }, {} as Record<string, string>) || {};

      // Set default game (fallback to pokemon)
      const defaultGame = settingsMap.RAW_INTAKE_DEFAULT_GAME || 'pokemon';
      
      // Set enabled games (fallback to just pokemon)
      let enabledGames = ['pokemon'];
      const enabledGamesValue = settingsMap.RAW_INTAKE_ENABLED_GAMES;
      if (enabledGamesValue) {
        try {
          const parsed = JSON.parse(enabledGamesValue);
          enabledGames = Array.isArray(parsed) ? parsed : ['pokemon'];
        } catch {
          enabledGames = ['pokemon'];
        }
      }

      setSettings({ defaultGame, enabledGames });
    } catch (error) {
      console.error('Error loading raw intake settings:', error);
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, refetch: loadSettings };
}
