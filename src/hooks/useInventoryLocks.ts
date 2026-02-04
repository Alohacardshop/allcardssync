import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InventoryLock {
  id: string;
  sku: string;
  store_key: string;
  lock_type: 'bulk_transfer' | 'recount' | 'reconciliation' | 'manual_adjustment';
  locked_by: string | null;
  locked_at: string;
  expires_at: string;
  context: Record<string, unknown>;
}

export interface ActiveLocksSummary {
  total: number;
  byType: Record<string, number>;
  locks: InventoryLock[];
}

/**
 * Hook to fetch active inventory locks for a store
 */
export function useActiveInventoryLocks(storeKey?: string) {
  return useQuery({
    queryKey: ['inventory-locks', storeKey],
    queryFn: async (): Promise<ActiveLocksSummary> => {
      let query = supabase
        .from('inventory_write_locks')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('locked_at', { ascending: false });

      if (storeKey) {
        query = query.eq('store_key', storeKey);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch inventory locks:', error);
        return { total: 0, byType: {}, locks: [] };
      }

      const locks = (data || []) as InventoryLock[];
      const byType: Record<string, number> = {};

      for (const lock of locks) {
        byType[lock.lock_type] = (byType[lock.lock_type] || 0) + 1;
      }

      return {
        total: locks.length,
        byType,
        locks,
      };
    },
    staleTime: 10_000, // 10 seconds
    refetchInterval: 30_000, // 30 seconds
    enabled: true,
  });
}

/**
 * Hook to check if specific SKUs are locked
 */
export function useCheckSkuLocks(skus: string[], storeKey: string) {
  return useQuery({
    queryKey: ['sku-locks', storeKey, skus],
    queryFn: async () => {
      if (skus.length === 0) return [];

      const { data, error } = await supabase.rpc('check_inventory_locks', {
        p_skus: skus,
        p_store_key: storeKey,
      });

      if (error) {
        console.error('Failed to check SKU locks:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        sku: row.sku,
        isLocked: row.is_locked || false,
        lockType: row.lock_type,
        lockedBy: row.locked_by,
        expiresAt: row.expires_at,
      }));
    },
    staleTime: 5_000,
    enabled: skus.length > 0 && !!storeKey,
  });
}

/**
 * Hook to manually release locks (admin only)
 */
export function useReleaseLocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ skus, storeKey }: { skus: string[]; storeKey: string }) => {
      const { data, error } = await supabase.rpc('release_inventory_locks', {
        p_skus: skus,
        p_store_key: storeKey,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (released) => {
      toast.success(`Released ${released} inventory locks`);
      queryClient.invalidateQueries({ queryKey: ['inventory-locks'] });
      queryClient.invalidateQueries({ queryKey: ['sku-locks'] });
    },
    onError: (error) => {
      toast.error('Failed to release locks', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
