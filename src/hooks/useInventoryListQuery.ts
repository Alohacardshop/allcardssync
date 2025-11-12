import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InventoryFilters {
  storeKey: string;
  locationGid: string;
  activeTab: 'raw' | 'graded' | 'raw_comics' | 'graded_comics';
  statusFilter: 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';
  batchFilter: 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch';
  printStatusFilter?: 'all' | 'printed' | 'not-printed';
  comicsSubCategory?: string | null;
  searchTerm?: string;
  autoRefreshEnabled?: boolean;
  currentBatchLotId?: string | null;
}

const PAGE_SIZE = 25;

export function useInventoryListQuery(filters: InventoryFilters) {
  return useInfiniteQuery({
    queryKey: [
      'inventory-list',
      filters.storeKey,
      filters.locationGid,
      filters.activeTab,
      filters.statusFilter,
      filters.batchFilter,
      filters.printStatusFilter,
      filters.comicsSubCategory,
      filters.searchTerm,
      filters.currentBatchLotId,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const {
        storeKey,
        locationGid,
        activeTab,
        statusFilter,
        batchFilter,
        printStatusFilter = 'all',
        comicsSubCategory,
        searchTerm,
      } = filters;

      // Build query with minimal columns for list view (reduced payload)
      let query = supabase
        .from('intake_items')
        .select(
          `
          id,
          sku,
          brand_title,
          subject,
          grade,
          price,
          quantity,
          type,
          created_at,
          printed_at,
          shopify_sync_status,
          shopify_product_id,
          store_key,
          shopify_location_gid,
          main_category,
          removed_from_batch_at,
          deleted_at,
          sold_at
        `,
          { count: 'exact' }
        )
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid);

      // Apply tab-based filtering
      if (activeTab === 'raw') {
        query = query.in('main_category', ['tcg', 'sports']).eq('type', 'Raw');
      } else if (activeTab === 'graded') {
        query = query.eq('type', 'Graded').or('main_category.is.null,main_category.in.(tcg,sports)');
      } else if (activeTab === 'raw_comics') {
        query = query.eq('main_category', 'comics').eq('type', 'Raw');
      } else if (activeTab === 'graded_comics') {
        query = query.eq('main_category', 'comics').eq('type', 'Graded');
      }

      // Apply status filter
      if (statusFilter === 'active') {
        query = query.is('deleted_at', null).is('sold_at', null).gt('quantity', 0);
      } else if (statusFilter === 'out-of-stock') {
        query = query.is('deleted_at', null).eq('quantity', 0);
      } else if (statusFilter === 'sold') {
        query = query.not('sold_at', 'is', null);
      } else if (statusFilter === 'deleted') {
        query = query.not('deleted_at', 'is', null);
      } else if (statusFilter === 'errors') {
        query = query.eq('shopify_sync_status', 'error');
      }

      // Apply batch filter
      if (batchFilter === 'in_batch') {
        query = query.is('removed_from_batch_at', null);
      } else if (batchFilter === 'removed_from_batch') {
        query = query.not('removed_from_batch_at', 'is', null);
      } else if (batchFilter === 'current_batch' && filters.currentBatchLotId) {
        query = query.eq('lot_id', filters.currentBatchLotId).is('removed_from_batch_at', null);
      }

      // Apply print status filter (Raw cards only)
      if (printStatusFilter === 'printed') {
        query = query.not('printed_at', 'is', null);
      } else if (printStatusFilter === 'not-printed') {
        query = query.is('printed_at', null);
      }

      // Apply search filter
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        query = query.or(
          `sku.ilike.%${searchLower}%,brand_title.ilike.%${searchLower}%,subject.ilike.%${searchLower}%,card_number.ilike.%${searchLower}%`
        );
      }

      // Order by created_at descending
      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return { 
        items: data || [], 
        count: count || 0,
        nextCursor: data && data.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - aggressive caching
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData, previousQuery) => {
      // Only use previous data if we're on the SAME tab to prevent cache bleed
      const previousTab = previousQuery?.queryKey?.[3];
      if (previousTab === filters.activeTab) {
        return previousData;
      }
      // Force fresh fetch when switching tabs
      return undefined;
    },
    refetchInterval: filters.autoRefreshEnabled ? 120000 : false,
    enabled: Boolean(filters.storeKey && filters.locationGid),
  });
}
