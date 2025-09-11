import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RawIntakeSettings {
  defaultGame: string;
  enabledGames: string[];
  costPercentage: number;
  costCalculationMode: 'market' | 'price';
}

export function useRawIntakeSettings() {
  const [settings, setSettings] = useState<RawIntakeSettings>({
    defaultGame: 'pokemon',
    enabledGames: ['pokemon'],
    costPercentage: 70,
    costCalculationMode: 'market'
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
        .in('key_name', ['RAW_INTAKE_DEFAULT_GAME', 'RAW_INTAKE_ENABLED_GAMES', 'RAW_INTAKE_COST_PERCENTAGE', 'RAW_INTAKE_COST_MODE']);

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

      // Set cost percentage (fallback to 70%)
      const costPercentage = parseFloat(settingsMap.RAW_INTAKE_COST_PERCENTAGE) || 70;
      
      // Set cost calculation mode (fallback to market)
      const costCalculationMode = settingsMap.RAW_INTAKE_COST_MODE || 'market';

      setSettings({ 
        defaultGame, 
        enabledGames, 
        costPercentage,
        costCalculationMode: costCalculationMode as 'market' | 'price'
      });
    } catch (error) {
      console.error('Error loading raw intake settings:', error);
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  };

  const updateCostSettings = async (costPercentage: number, costCalculationMode: 'market' | 'price') => {
    try {
      const updates = [
        {
          key_name: 'RAW_INTAKE_COST_PERCENTAGE',
          key_value: costPercentage.toString()
        },
        {
          key_name: 'RAW_INTAKE_COST_MODE', 
          key_value: costCalculationMode
        }
      ];

      for (const update of updates) {
        await supabase
          .from('system_settings')
          .upsert(update, { 
            onConflict: 'key_name',
            ignoreDuplicates: false 
          });
      }

      // Update local settings
      setSettings(prev => ({
        ...prev,
        costPercentage,
        costCalculationMode
      }));
    } catch (error) {
      console.error('Error updating cost settings:', error);
      throw error;
    }
  };

  return { settings, loading, refetch: loadSettings, updateCostSettings };
}
