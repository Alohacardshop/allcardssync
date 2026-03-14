import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cached hook for fetching product IDs belonging to a Shopify collection.
 * Prevents re-invoking the edge function on every inventory query change.
 */
export function useCollectionProducts(storeKey: string | null, collectionGid: string | null) {
  return useQuery({
    queryKey: ['collection-products', storeKey, collectionGid],
    queryFn: async () => {
      if (!storeKey || !collectionGid || collectionGid === 'all') return null;
      
      const { data, error } = await supabase.functions.invoke(
        'fetch-collection-products',
        { body: { storeKey, collectionGid } }
      );
      
      if (error) throw error;
      return (data?.productIds as string[]) || [];
    },
    enabled: Boolean(storeKey && collectionGid && collectionGid !== 'all'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}
