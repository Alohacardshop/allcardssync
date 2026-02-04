import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagCount {
  tag: string;
  count: number;
}

export function useShopifyTags(storeKey: string | null) {
  return useQuery({
    queryKey: ['shopify-tags', storeKey],
    queryFn: async () => {
      if (!storeKey) return [];

      // Use database function for efficient aggregation (100x faster)
      const { data, error } = await supabase
        .rpc('get_tag_counts', { p_store_key: storeKey });

      if (error) {
        console.error('Error fetching tag counts:', error);
        throw error;
      }

      // Map database result to TagCount format
      const tagCounts: TagCount[] = (data || []).map((row: { tag: string; count: number }) => ({
        tag: row.tag,
        count: Number(row.count)
      }));

      return tagCounts;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: Boolean(storeKey),
  });
}
