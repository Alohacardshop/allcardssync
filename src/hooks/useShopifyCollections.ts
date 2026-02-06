import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ShopifyCollection {
  id?: string;
  store_key: string;
  collection_gid: string;
  title: string;
  handle?: string;
  product_count: number;
  collection_type?: 'smart' | 'custom';
  updated_at?: string;
}

interface FetchCollectionsResponse {
  ok: boolean;
  storeKey: string;
  count: number;
  collections: ShopifyCollection[];
  cached?: boolean;
  error?: string;
}

/**
 * Hook to fetch Shopify collections for the filter dropdown.
 * Collections are cached in the database and refreshed via edge function.
 */
export function useShopifyCollections(storeKey: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['shopify-collections', storeKey],
    queryFn: async () => {
      if (!storeKey) return [];

      // First try to get from database cache
      const { data: cached, error: cacheError } = await supabase
        .from('shopify_collections')
        .select('*')
        .eq('store_key', storeKey)
        .order('title');

      // If we have cached data, use it while potentially refreshing in background
      if (cached && cached.length > 0 && !cacheError) {
        // Check if cache is stale (> 5 minutes old)
        const newestUpdate = new Date(Math.max(...cached.map(c => new Date(c.updated_at!).getTime())));
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (newestUpdate > fiveMinutesAgo) {
          return cached as ShopifyCollection[];
        }
      }

      // Fetch fresh data from edge function
      const { data, error } = await supabase.functions.invoke<FetchCollectionsResponse>(
        'fetch-shopify-collections',
        {
          body: { storeKey, forceRefresh: false }
        }
      );

      if (error) {
        console.error('Failed to fetch Shopify collections:', error);
        // Fall back to cached data if available
        if (cached && cached.length > 0) {
          return cached as ShopifyCollection[];
        }
        throw error;
      }

      if (!data?.ok) {
        console.error('Edge function returned error:', data?.error);
        // Fall back to cached data if available
        if (cached && cached.length > 0) {
          return cached as ShopifyCollection[];
        }
        throw new Error(data?.error || 'Failed to fetch collections');
      }

      // Map the response to our type
      return data.collections.map(c => ({
        store_key: storeKey,
        collection_gid: c.collection_gid,
        title: c.title,
        handle: c.handle,
        product_count: c.product_count,
        collection_type: c.collection_type,
      })) as ShopifyCollection[];
    },
    enabled: Boolean(storeKey) && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

/**
 * Group collections by type for display in dropdown
 */
export function groupCollections(collections: ShopifyCollection[]): Array<{
  group: string;
  collections: ShopifyCollection[];
}> {
  const smartCollections = collections.filter(c => c.collection_type === 'smart');
  const customCollections = collections.filter(c => c.collection_type === 'custom' || !c.collection_type);

  const groups: Array<{ group: string; collections: ShopifyCollection[] }> = [];

  if (smartCollections.length > 0) {
    groups.push({
      group: 'Smart Collections',
      collections: smartCollections.sort((a, b) => a.title.localeCompare(b.title))
    });
  }

  if (customCollections.length > 0) {
    groups.push({
      group: 'Manual Collections',
      collections: customCollections.sort((a, b) => a.title.localeCompare(b.title))
    });
  }

  return groups;
}
