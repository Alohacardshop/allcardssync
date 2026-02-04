// Inventory Lock Helper Functions
// Shared utilities for acquiring, releasing, and checking inventory write locks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

export interface LockAcquisitionResult {
  success: boolean;
  acquiredCount: number;
  failedSkus: string[];
  batchId: string | null;
  error?: string;
}

export interface LockCheckResult {
  sku: string;
  isLocked: boolean;
  lockType: string | null;
  lockedBy: string | null;
  expiresAt: string | null;
}

/**
 * Acquire inventory locks for a set of SKUs
 * @param supabase - Supabase client (service role)
 * @param skus - Array of SKUs to lock
 * @param storeKey - Store identifier
 * @param lockType - Type of lock (bulk_transfer, recount, reconciliation, manual_adjustment)
 * @param lockedBy - User ID or system identifier
 * @param timeoutMinutes - Lock expiration time in minutes (default 15)
 * @param context - Additional context data
 */
export async function acquireInventoryLocks(
  supabase: ReturnType<typeof createClient>,
  skus: string[],
  storeKey: string,
  lockType: 'bulk_transfer' | 'recount' | 'reconciliation' | 'manual_adjustment',
  lockedBy: string,
  timeoutMinutes: number = 15,
  context: Record<string, unknown> = {}
): Promise<LockAcquisitionResult> {
  if (skus.length === 0) {
    return { success: true, acquiredCount: 0, failedSkus: [], batchId: null };
  }

  try {
    const { data, error } = await supabase.rpc('acquire_inventory_locks', {
      p_skus: skus,
      p_store_key: storeKey,
      p_lock_type: lockType,
      p_locked_by: lockedBy,
      p_timeout_minutes: timeoutMinutes,
      p_context: context
    });

    if (error) {
      console.error('[LOCK] Failed to acquire locks:', error);
      return {
        success: false,
        acquiredCount: 0,
        failedSkus: skus,
        batchId: null,
        error: error.message
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        success: false,
        acquiredCount: 0,
        failedSkus: skus,
        batchId: null,
        error: 'No result from lock acquisition'
      };
    }

    const acquiredCount = result.acquired_count || 0;
    const failedSkus = result.failed_skus || [];
    const batchId = result.lock_batch_id;

    console.log(`[LOCK] Acquired ${acquiredCount}/${skus.length} locks for ${lockType}, batch: ${batchId}`);

    return {
      success: failedSkus.length === 0,
      acquiredCount,
      failedSkus,
      batchId
    };
  } catch (err) {
    console.error('[LOCK] Exception acquiring locks:', err);
    return {
      success: false,
      acquiredCount: 0,
      failedSkus: skus,
      batchId: null,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Release inventory locks by batch ID
 */
export async function releaseInventoryLocksByBatch(
  supabase: ReturnType<typeof createClient>,
  batchId: string
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('release_inventory_locks', {
      p_batch_id: batchId
    });

    if (error) {
      console.error('[LOCK] Failed to release locks by batch:', error);
      return 0;
    }

    const released = data || 0;
    console.log(`[LOCK] Released ${released} locks for batch: ${batchId}`);
    return released;
  } catch (err) {
    console.error('[LOCK] Exception releasing locks:', err);
    return 0;
  }
}

/**
 * Release inventory locks by specific SKUs
 */
export async function releaseInventoryLocksBySkus(
  supabase: ReturnType<typeof createClient>,
  skus: string[],
  storeKey: string
): Promise<number> {
  if (skus.length === 0) return 0;

  try {
    const { data, error } = await supabase.rpc('release_inventory_locks', {
      p_skus: skus,
      p_store_key: storeKey
    });

    if (error) {
      console.error('[LOCK] Failed to release locks by SKUs:', error);
      return 0;
    }

    const released = data || 0;
    console.log(`[LOCK] Released ${released} locks for ${skus.length} SKUs`);
    return released;
  } catch (err) {
    console.error('[LOCK] Exception releasing locks:', err);
    return 0;
  }
}

/**
 * Check which SKUs are currently locked
 */
export async function checkInventoryLocks(
  supabase: ReturnType<typeof createClient>,
  skus: string[],
  storeKey: string
): Promise<LockCheckResult[]> {
  if (skus.length === 0) return [];

  try {
    const { data, error } = await supabase.rpc('check_inventory_locks', {
      p_skus: skus,
      p_store_key: storeKey
    });

    if (error) {
      console.error('[LOCK] Failed to check locks:', error);
      return skus.map(sku => ({
        sku,
        isLocked: false,
        lockType: null,
        lockedBy: null,
        expiresAt: null
      }));
    }

    return (data || []).map((row: any) => ({
      sku: row.sku,
      isLocked: row.is_locked || false,
      lockType: row.lock_type,
      lockedBy: row.locked_by,
      expiresAt: row.expires_at
    }));
  } catch (err) {
    console.error('[LOCK] Exception checking locks:', err);
    return skus.map(sku => ({
      sku,
      isLocked: false,
      lockType: null,
      lockedBy: null,
      expiresAt: null
    }));
  }
}

/**
 * Filter out locked SKUs from a list
 * Returns only unlocked SKUs
 */
export async function filterLockedSkus(
  supabase: ReturnType<typeof createClient>,
  skus: string[],
  storeKey: string
): Promise<{ unlockedSkus: string[]; lockedSkus: string[] }> {
  if (skus.length === 0) {
    return { unlockedSkus: [], lockedSkus: [] };
  }

  const lockStatus = await checkInventoryLocks(supabase, skus, storeKey);
  
  const unlockedSkus: string[] = [];
  const lockedSkus: string[] = [];

  for (const status of lockStatus) {
    if (status.isLocked) {
      lockedSkus.push(status.sku);
    } else {
      unlockedSkus.push(status.sku);
    }
  }

  if (lockedSkus.length > 0) {
    console.log(`[LOCK] Filtered ${lockedSkus.length} locked SKUs, ${unlockedSkus.length} unlocked`);
  }

  return { unlockedSkus, lockedSkus };
}

/**
 * Clean up expired locks (called opportunistically)
 */
export async function cleanupExpiredLocks(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('inventory_write_locks')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[LOCK] Failed to cleanup expired locks:', error);
      return 0;
    }

    const cleaned = data?.length || 0;
    if (cleaned > 0) {
      console.log(`[LOCK] Cleaned up ${cleaned} expired locks`);
    }
    return cleaned;
  } catch (err) {
    console.error('[LOCK] Exception cleaning up locks:', err);
    return 0;
  }
}
