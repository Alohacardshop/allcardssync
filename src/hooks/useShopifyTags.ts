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

      // Get distinct tags with counts from the shopify_tags array column
      const { data, error } = await supabase
        .from('intake_items')
        .select('shopify_tags')
        .eq('store_key', storeKey)
        .is('deleted_at', null)
        .not('shopify_tags', 'is', null);

      if (error) throw error;

      // Count occurrences of each tag
      const tagCounts = new Map<string, number>();
      
      for (const row of data || []) {
        const tags = row.shopify_tags as string[] | null;
        if (tags && Array.isArray(tags)) {
          for (const tag of tags) {
            // Normalize tag (lowercase, trim)
            const normalizedTag = tag.toLowerCase().trim();
            if (normalizedTag) {
              tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
            }
          }
        }
      }

      // Convert to array and sort by count descending
      const sortedTags: TagCount[] = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      return sortedTags;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: Boolean(storeKey),
  });
}
