import { useRegionSettings } from '@/hooks/useRegionSettings';

/**
 * Returns boolean flags for region-gated services.
 * Components use these to conditionally render eBay / Comics UI.
 */
export function useServiceFlags() {
  const { settings } = useRegionSettings();

  return {
    ebayEnabled: settings?.['services.ebay_sync'] !== false,
    comicsEnabled: settings?.['services.comics_enabled'] !== false,
  };
}
