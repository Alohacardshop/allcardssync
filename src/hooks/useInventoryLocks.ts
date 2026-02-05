import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LockType = 'bulk_transfer' | 'recount' | 'reconciliation' | 'manual_adjustment';

export interface InventoryLock {
  id: string;
  sku: string;
  store_key: string;
  lock_type: LockType;
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
 * Get human-readable lock type label
 */
export function getLockTypeLabel(lockType: LockType): string {
  const labels: Record<LockType, string> = {
    bulk_transfer: 'Bulk Transfer',
    recount: 'Recount',
    reconciliation: 'Reconciliation',
    manual_adjustment: 'Manual Adjustment',
  };
  return labels[lockType] || lockType;
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
 * Hook to check if a single SKU is locked (fast path)
 */
export function useIsSkuLocked(sku: string | undefined, storeKey: string | undefined) {
  return useQuery({
    queryKey: ['sku-lock', storeKey, sku],
    queryFn: async () => {
      if (!sku || !storeKey) return false;

      const { data, error } = await supabase.rpc('is_sku_locked', {
        p_sku: sku,
        p_store_key: storeKey,
      });

      if (error) {
        console.error('Failed to check SKU lock:', error);
        return false;
      }

      return data === true;
    },
    staleTime: 5_000,
    enabled: !!sku && !!storeKey,
  });
}

/**
 * Hook to get lock info for multiple SKUs
 * Returns a map of SKU -> lock info for locked items only
 */
export function useSkuLockMap(skus: string[], storeKey: string | undefined) {
  return useQuery({
    queryKey: ['sku-lock-map', storeKey, skus.sort().join(',')],
    queryFn: async () => {
      if (skus.length === 0 || !storeKey) return new Map<string, InventoryLock>();

      const { data, error } = await supabase
        .from('inventory_write_locks')
        .select('*')
        .eq('store_key', storeKey)
        .in('sku', skus)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to fetch SKU locks:', error);
        return new Map<string, InventoryLock>();
      }

      const lockMap = new Map<string, InventoryLock>();
      for (const lock of data || []) {
        lockMap.set(lock.sku, lock as InventoryLock);
      }
      return lockMap;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: skus.length > 0 && !!storeKey,
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
 * Hook to force-release locks (admin only)
 */
export function useForceReleaseLocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: {
      lockIds?: string[];
      skus?: string[];
      storeKey?: string;
      lockType?: LockType;
    }) => {
      const params: Record<string, unknown> = {};
      
      if (options.lockIds) {
        params.p_lock_ids = options.lockIds;
      } else if (options.skus && options.storeKey) {
        params.p_skus = options.skus;
        params.p_store_key = options.storeKey;
      } else if (options.lockType && options.storeKey) {
        params.p_lock_type = options.lockType;
        params.p_store_key = options.storeKey;
      } else if (options.storeKey) {
        params.p_store_key = options.storeKey;
      } else {
        throw new Error('Invalid options for force release');
      }

      const { data, error } = await supabase.rpc('force_release_inventory_locks', params as any);

      if (error) throw error;
      return data;
    },
    onSuccess: (released) => {
      toast.success(`Force-released ${released} inventory lock(s)`);
      queryClient.invalidateQueries({ queryKey: ['inventory-locks'] });
      queryClient.invalidateQueries({ queryKey: ['sku-locks'] });
      queryClient.invalidateQueries({ queryKey: ['sku-lock'] });
      queryClient.invalidateQueries({ queryKey: ['sku-lock-map'] });
    },
    onError: (error) => {
      toast.error('Failed to force-release locks', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
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
