/**
 * Centralized query key factory for React Query
 * Single source of truth for all cache keys
 */
export const queryKeys = {
  currentBatch: (storeKey?: string | null, locationGid?: string | null) => 
    ['currentBatch', storeKey, locationGid],
  intakeItems: (filters?: Record<string, any>) => 
    ['intakeItems', filters],
};
