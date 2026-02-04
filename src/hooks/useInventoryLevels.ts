import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CachedLocation } from './useLocationNames';

export interface InventoryLevel {
  id: string;
  store_key: string;
  inventory_item_id: string;
  location_gid: string;
  location_name: string | null;
  available: number;
  shopify_updated_at: string | null;
  updated_at: string;
}

/**
 * Fetches inventory levels for a specific inventory_item_id
 */
export function useInventoryLevels(inventoryItemId: string | null | undefined) {
  return useQuery({
    queryKey: ['inventory-levels', inventoryItemId],
    queryFn: async () => {
      if (!inventoryItemId) return [];

      const { data, error } = await supabase
        .from('shopify_inventory_levels')
        .select('*')
        .eq('inventory_item_id', inventoryItemId)
        .order('available', { ascending: false });

      if (error) {
        console.error('Failed to fetch inventory levels:', error);
        return [];
      }

      return data as InventoryLevel[];
    },
    enabled: Boolean(inventoryItemId),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetches inventory levels for multiple items at once (batch)
 */
export function useBatchInventoryLevels(inventoryItemIds: string[]) {
  return useQuery({
    queryKey: ['batch-inventory-levels', inventoryItemIds.sort().join(',')],
    queryFn: async () => {
      if (!inventoryItemIds.length) return new Map<string, InventoryLevel[]>();

      const { data, error } = await supabase
        .from('shopify_inventory_levels')
        .select('*')
        .in('inventory_item_id', inventoryItemIds);

      if (error) {
        console.error('Failed to fetch batch inventory levels:', error);
        return new Map<string, InventoryLevel[]>();
      }

      // Group by inventory_item_id
      const grouped = new Map<string, InventoryLevel[]>();
      (data || []).forEach((level: InventoryLevel) => {
        const existing = grouped.get(level.inventory_item_id) || [];
        existing.push(level);
        grouped.set(level.inventory_item_id, existing);
      });

      return grouped;
    },
    enabled: inventoryItemIds.length > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * Get total stock across all locations
 */
export function getTotalStock(levels: InventoryLevel[]): number {
  return levels.reduce((sum, level) => sum + Math.max(0, level.available), 0);
}

/**
 * Enrich inventory levels with location names from cache
 */
export function enrichLevelsWithNames(
  levels: InventoryLevel[],
  locationsMap: Map<string, CachedLocation> | undefined
): Array<InventoryLevel & { displayName: string }> {
  return levels.map(level => ({
    ...level,
    displayName: level.location_name || 
      locationsMap?.get(level.location_gid)?.location_name ||
      extractLocationId(level.location_gid)
  }));
}

function extractLocationId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? `Location ${match[1]}` : gid;
}
