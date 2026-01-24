import { useMemo, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import { getEcosystemTheme, ECOSYSTEM_THEMES, type EcosystemKey } from '@/lib/design-tokens';
import { useRegionSettings } from '@/hooks/useRegionSettings';

/**
 * Hook to get the current ecosystem's theme based on user's assigned store/region
 * Returns ecosystem-specific colors, classes, and display values
 * Integrates with region_settings for dynamic overrides
 */
export function useEcosystemTheme() {
  const { assignedStore, assignedRegion } = useStore();
  const { 
    accentColor, 
    icon: settingsIcon, 
    displayName: settingsDisplayName,
    logoUrl,
    isLoading: settingsLoading,
  } = useRegionSettings();
  
  const ecosystem = useMemo(() => {
    // Determine ecosystem from assignedStore or assignedRegion
    if (assignedStore === 'hawaii' || assignedRegion === 'hawaii') {
      return 'hawaii' as EcosystemKey;
    }
    if (assignedStore === 'las_vegas' || assignedRegion === 'las_vegas') {
      return 'las_vegas' as EcosystemKey;
    }
    // Default to hawaii if nothing assigned
    return 'hawaii' as EcosystemKey;
  }, [assignedStore, assignedRegion]);

  const baseTheme = useMemo(() => getEcosystemTheme(ecosystem), [ecosystem]);

  // Apply dynamic accent color from region settings
  useEffect(() => {
    if (accentColor && !settingsLoading) {
      // Apply accent color as CSS variable for dynamic theming
      document.documentElement.style.setProperty('--ecosystem-accent', accentColor);
    }
    return () => {
      document.documentElement.style.removeProperty('--ecosystem-accent');
    };
  }, [accentColor, settingsLoading]);

  const isHawaii = ecosystem === 'hawaii';
  const isLasVegas = ecosystem === 'las_vegas';

  // Merge base theme with dynamic settings
  const theme = useMemo(() => ({
    ...baseTheme,
    // Override with settings if available
    name: settingsDisplayName || baseTheme.name,
    icon: settingsIcon || baseTheme.icon,
    accentColor: accentColor || undefined,
    logoUrl: logoUrl || undefined,
  }), [baseTheme, settingsDisplayName, settingsIcon, accentColor, logoUrl]);

  return {
    ecosystem,
    theme,
    isHawaii,
    isLasVegas,
    // Convenience accessors (with settings overrides)
    name: theme.name,
    shortName: baseTheme.shortName,
    icon: theme.icon,
    badgeClass: baseTheme.badgeClass,
    accentClass: baseTheme.accentClass,
    bgClass: baseTheme.bgClass,
    // Dynamic settings
    accentColor: theme.accentColor,
    logoUrl: theme.logoUrl,
    // Loading state
    isLoading: settingsLoading,
    // All available ecosystems for reference
    allEcosystems: ECOSYSTEM_THEMES,
  };
}
