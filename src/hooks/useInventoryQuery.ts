import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InventoryFilters {
  storeKey: string;
  locationGid: string;
  activeTab: 'raw' | 'graded' | 'comics';
  statusFilter: 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';
  batchFilter: 'all' | 'in_batch' | 'removed_from_batch';
  printStatusFilter?: 'all' | 'printed' | 'not-printed';
  comicsSubCategory?: string | null;
  searchTerm?: string;
  limit?: number;
  autoRefreshEnabled?: boolean;
}

export function useInventoryQuery(filters: InventoryFilters) {
  return useQuery({
    queryKey: [
      'inventory',
      filters.storeKey,
      filters.locationGid,
      filters.activeTab,
      filters.statusFilter,
      filters.batchFilter,
      filters.printStatusFilter,
      filters.comicsSubCategory,
      filters.searchTerm,
    ],
    queryFn: async () => {
      const {
        storeKey,
        locationGid,
        activeTab,
        statusFilter,
        batchFilter,
        printStatusFilter = 'all',
        comicsSubCategory,
        searchTerm,
        limit = 25, // Reduced from 50 for faster initial load
      } = filters;

      // Build the query
      let query = supabase
        .from('intake_items')
        .select(
          `
          id,
          sku,
          brand_title,
          subject,
          card_number,
          variant,
          grade,
          price,
          quantity,
          type,
          created_at,
          printed_at,
          pushed_at,
          deleted_at,
          sold_at,
          shopify_sync_status,
          shopify_product_id,
          store_key,
          shopify_location_gid,
          psa_cert,
          catalog_snapshot,
          psa_snapshot,
          image_urls,
          year,
          category,
          main_category,
          sub_category,
          cost,
          removed_from_batch_at,
          ebay_price_check,
          intake_lots(
            lot_number,
            status
          )
        `,
          { count: 'exact' }
        )
        .range(0, limit - 1)
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid);

      // Apply tab-based filtering
      if (activeTab === 'raw') {
        query = query.eq('main_category', 'tcg').eq('type', 'Raw');
      } else if (activeTab === 'graded') {
        query = query.eq('main_category', 'tcg').eq('type', 'Graded');
      } else if (activeTab === 'comics') {
        query = query.eq('main_category', 'comics');
        if (comicsSubCategory) {
          query = query.eq('sub_category', comicsSubCategory);
        }
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
      }

      // Apply print status filter (Raw cards only)
      if (printStatusFilter === 'printed') {
        query = query.not('printed_at', 'is', null);
      } else if (printStatusFilter === 'not-printed') {
        query = query.is('printed_at', null);
      }

      // Apply search filter at database level if provided
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

      return { items: data || [], count: count || 0 };
    },
    staleTime: 60 * 1000, // Data is fresh for 1 minute
    gcTime: 10 * 60 * 1000, // Keep cached data for 10 minutes
    refetchInterval: filters.autoRefreshEnabled ? 120000 : false, // Auto-refetch every 2 minutes if enabled
    placeholderData: (previousData) => previousData, // Show previous data while fetching
    enabled: Boolean(filters.storeKey && filters.locationGid), // Only fetch when store/location are set
  });
}
