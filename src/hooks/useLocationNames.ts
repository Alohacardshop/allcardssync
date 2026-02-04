import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CachedLocation {
  location_gid: string;
  location_name: string;
  location_id?: string | null;
}

/**
 * Fetches and caches location GID-to-name mappings for a store
 * Falls back to fresh fetch from edge function if cache is empty
 */
export function useLocationNames(storeKey: string | null) {
  return useQuery({
    queryKey: ['location-names', storeKey],
    queryFn: async () => {
      if (!storeKey) return new Map<string, CachedLocation>();

      // First try to get from cache
      const { data: cached, error: cacheError } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name, location_id')
        .eq('store_key', storeKey);

      if (!cacheError && cached && cached.length > 0) {
        const map = new Map<string, CachedLocation>();
        cached.forEach(loc => {
          map.set(loc.location_gid, {
            location_gid: loc.location_gid,
            location_name: loc.location_name,
            location_id: loc.location_id
          });
        });
        return map;
      }

      // Cache is empty - fetch fresh from edge function and it will populate cache
      try {
        const { data, error } = await supabase.functions.invoke('fetch-shopify-locations', {
          body: { storeKey }
        });

        if (error) throw error;

        // Build map from response
        const map = new Map<string, CachedLocation>();
        if (data?.locations) {
          data.locations.forEach((loc: any) => {
            map.set(loc.gid, {
              location_gid: loc.gid,
              location_name: loc.name,
              location_id: String(loc.id)
            });
          });
        }
        return map;
      } catch (fetchError) {
        console.error('Failed to fetch locations:', fetchError);
        return new Map<string, CachedLocation>();
      }
    },
    enabled: Boolean(storeKey),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Get a location name from GID using the cached data
 */
export function getLocationName(
  gid: string | null | undefined,
  locationsMap: Map<string, CachedLocation> | undefined
): string {
  if (!gid || !locationsMap) return '';
  
  const location = locationsMap.get(gid);
  if (location) return location.location_name;
  
  // Fallback: extract numeric ID from GID
  const match = gid.match(/\/(\d+)$/);
  return match ? `Location ${match[1]}` : gid;
}

/**
 * Get short location name (first word only for badges)
 */
export function getShortLocationName(
  gid: string | null | undefined,
  locationsMap: Map<string, CachedLocation> | undefined
): string {
  const fullName = getLocationName(gid, locationsMap);
  // Return first word for compact display
  return fullName.split(' ')[0] || fullName;
}
