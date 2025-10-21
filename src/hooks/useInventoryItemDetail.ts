import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to fetch full item details including heavy data like snapshots and images
 * Only called when user expands an item
 */
export function useInventoryItemDetail(itemId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['inventory-item-detail', itemId],
    queryFn: async () => {
      if (!itemId) return null;

      const { data, error } = await supabase
        .from('intake_items')
        .select(
          `
          id,
          catalog_snapshot,
          psa_snapshot,
          image_urls,
          shopify_snapshot,
          pricing_snapshot,
          label_snapshot,
          grading_data,
          source_payload,
          processing_notes,
          shopify_sync_snapshot,
          last_shopify_sync_error,
          last_shopify_synced_at,
          pushed_at,
          cost,
          vendor,
          intake_lots(
            lot_number,
            status
          )
        `
        )
        .eq('id', itemId)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - details don't change often
    gcTime: 10 * 60 * 1000,
    enabled: enabled && Boolean(itemId),
  });
}
