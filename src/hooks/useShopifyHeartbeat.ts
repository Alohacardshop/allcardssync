import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HeartbeatStatus {
  store_key: string;
  location_gid: string | null;
  location_name: string | null;
  last_received_at: string | null;
  last_topic: string | null;
  is_stale: boolean;
  minutes_since_last: number | null;
}

export interface StoreHeartbeatSummary {
  store_key: string;
  locations: HeartbeatStatus[];
  has_stale_locations: boolean;
  oldest_activity_minutes: number | null;
}

const STALE_THRESHOLD_MINUTES = 60;

export function useShopifyHeartbeat() {
  return useQuery({
    queryKey: ['shopify-heartbeat'],
    queryFn: async (): Promise<StoreHeartbeatSummary[]> => {
      // Get latest heartbeat per store/location (aggregate across topics)
      const { data: heartbeatData, error } = await supabase
        .from('webhook_health')
        .select('store_key, location_gid, topic, last_received_at, updated_at')
        .order('last_received_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch webhook heartbeat:', error);
        return [];
      }

      // Get location names from cache for display
      const { data: locations } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name');

      const locationNameMap = new Map<string, string>();
      for (const loc of locations || []) {
        if (loc.location_gid && loc.location_name) {
          locationNameMap.set(loc.location_gid, loc.location_name);
        }
      }

      const now = new Date();

      // Group by store/location, taking the most recent activity across all topics
      const storeLocationMap = new Map<string, HeartbeatStatus>();

      for (const row of heartbeatData || []) {
        const key = `${row.store_key}|${row.location_gid || 'global'}`;
        const existing = storeLocationMap.get(key);

        const lastReceived = row.last_received_at ? new Date(row.last_received_at) : null;
        const minutesSinceLast = lastReceived 
          ? Math.floor((now.getTime() - lastReceived.getTime()) / (1000 * 60))
          : null;

        // Keep the most recent activity for this store/location
        if (!existing || (lastReceived && (!existing.last_received_at || lastReceived > new Date(existing.last_received_at)))) {
          storeLocationMap.set(key, {
            store_key: row.store_key,
            location_gid: row.location_gid,
            location_name: row.location_gid ? locationNameMap.get(row.location_gid) || null : null,
            last_received_at: row.last_received_at,
            last_topic: row.topic,
            is_stale: minutesSinceLast !== null && minutesSinceLast > STALE_THRESHOLD_MINUTES,
            minutes_since_last: minutesSinceLast,
          });
        }
      }

      // Group by store
      const storeMap = new Map<string, HeartbeatStatus[]>();
      for (const status of storeLocationMap.values()) {
        const existing = storeMap.get(status.store_key) || [];
        existing.push(status);
        storeMap.set(status.store_key, existing);
      }

      // Build summaries
      const summaries: StoreHeartbeatSummary[] = [];
      for (const [store_key, locations] of storeMap.entries()) {
        const staleLocations = locations.filter(l => l.is_stale);
        const allMinutes = locations
          .map(l => l.minutes_since_last)
          .filter((m): m is number => m !== null);
        
        summaries.push({
          store_key,
          locations,
          has_stale_locations: staleLocations.length > 0,
          oldest_activity_minutes: allMinutes.length > 0 ? Math.max(...allMinutes) : null,
        });
      }

      return summaries.sort((a, b) => a.store_key.localeCompare(b.store_key));
    },
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  });
}
