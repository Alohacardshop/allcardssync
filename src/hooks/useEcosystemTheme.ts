import { useMemo } from 'react';
import { useStore } from '@/contexts/StoreContext';
import { getEcosystemTheme, ECOSYSTEM_THEMES, type EcosystemKey } from '@/lib/design-tokens';

/**
 * Hook to get the current ecosystem's theme based on user's assigned store/region
 * Returns ecosystem-specific colors, classes, and display values
 */
export function useEcosystemTheme() {
  const { assignedStore, assignedRegion } = useStore();
  
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

  const theme = useMemo(() => getEcosystemTheme(ecosystem), [ecosystem]);

  const isHawaii = ecosystem === 'hawaii';
  const isLasVegas = ecosystem === 'las_vegas';

  return {
    ecosystem,
    theme,
    isHawaii,
    isLasVegas,
    // Convenience accessors
    name: theme.name,
    shortName: theme.shortName,
    icon: theme.icon,
    badgeClass: theme.badgeClass,
    accentClass: theme.accentClass,
    bgClass: theme.bgClass,
    // All available ecosystems for reference
    allEcosystems: ECOSYSTEM_THEMES,
  };
}
