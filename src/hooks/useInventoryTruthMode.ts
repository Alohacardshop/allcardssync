import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type InventoryTruthMode = 'shopify' | 'database';

interface TruthModeResult {
  mode: InventoryTruthMode;
  isShopifyTruth: boolean;
  isDatabaseTruth: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch the inventory truth mode for a store
 * 
 * - 'shopify': Shopify is source of truth. Manual quantity edits disabled.
 * - 'database': Local database is source of truth. Manual edits allowed.
 */
export function useInventoryTruthMode(storeKey: string | null): TruthModeResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory-truth-mode', storeKey],
    queryFn: async () => {
      if (!storeKey) return 'shopify' as InventoryTruthMode;
      
      const { data, error } = await supabase
        .from('shopify_stores')
        .select('inventory_truth_mode')
        .eq('key', storeKey)
        .maybeSingle();
      
      if (error) throw error;
      
      return (data?.inventory_truth_mode || 'shopify') as InventoryTruthMode;
    },
    enabled: !!storeKey,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const mode = data || 'shopify';
  
  return {
    mode,
    isShopifyTruth: mode === 'shopify',
    isDatabaseTruth: mode === 'database',
    isLoading,
    error: error as Error | null,
  };
}
