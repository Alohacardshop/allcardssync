import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';

export interface InventoryFilters {
  storeKey: string;
  locationGid: string;
  activeTab: 'raw' | 'graded' | 'raw_comics' | 'graded_comics' | 'sealed';
  statusFilter: 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';
  batchFilter: 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch';
  printStatusFilter?: 'all' | 'printed' | 'not-printed';
  typeFilter?: 'all' | 'raw' | 'graded';
  
  searchTerm?: string;
  autoRefreshEnabled?: boolean;
  currentBatchLotId?: string | null;
  // New filters for unified hub
  shopifySyncFilter?: 'all' | 'not-synced' | 'synced' | 'queued' | 'error';
  ebayStatusFilter?: 'all' | 'not-listed' | 'listed' | 'queued' | 'error';
  dateRangeFilter?: 'all' | 'today' | 'yesterday' | '7days' | '30days';
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
      filters.typeFilter,
      
      filters.searchTerm,
      filters.currentBatchLotId,
      filters.shopifySyncFilter,
      filters.ebayStatusFilter,
      filters.dateRangeFilter,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const {
        storeKey,
        locationGid,
        activeTab,
        statusFilter,
        batchFilter,
        printStatusFilter = 'all',
        typeFilter = 'all',
        
        searchTerm,
        shopifySyncFilter = 'all',
        ebayStatusFilter = 'all',
        dateRangeFilter = 'all',
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
          sold_at,
          card_number,
          ebay_price_check,
          shopify_snapshot,
          ebay_listing_id,
          ebay_sync_status,
          list_on_ebay,
          vendor,
          year,
          category,
          variant
        `,
          { count: 'exact' }
        )
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid);

      // Apply type filter (overrides tab-based type filtering when set)
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter === 'raw' ? 'Raw' : 'Graded');
        // Still apply category from tab
        if (activeTab === 'raw_comics' || activeTab === 'graded_comics') {
          query = query.eq('main_category', 'comics');
        } else if (activeTab !== 'sealed') {
          query = query.or('main_category.is.null,main_category.eq.tcg');
        }
      } else {
        // Apply tab-based filtering
        if (activeTab === 'raw') {
          query = query.eq('main_category', 'tcg').eq('type', 'Raw');
        } else if (activeTab === 'graded') {
          query = query.eq('type', 'Graded').or('main_category.is.null,main_category.eq.tcg');
        } else if (activeTab === 'sealed') {
          // Sealed products: filter by shopify_snapshot tags containing 'sealed'
          query = query.ilike('shopify_snapshot->>tags', '%sealed%');
        } else if (activeTab === 'raw_comics') {
          query = query.eq('main_category', 'comics').eq('type', 'Raw');
        } else if (activeTab === 'graded_comics') {
          query = query.eq('main_category', 'comics').eq('type', 'Graded');
        }
      }

      // Apply status filter
      if (statusFilter === 'active') {
        query = query.is('deleted_at', null).is('sold_at', null).gt('quantity', 0);
      } else if (statusFilter === 'out-of-stock') {
        query = query.is('deleted_at', null).eq('quantity', 0);
      } else if (statusFilter === 'sold') {
        query = query.is('deleted_at', null).not('sold_at', 'is', null);
      } else if (statusFilter === 'deleted') {
        query = query.not('deleted_at', 'is', null);
      } else if (statusFilter === 'errors') {
        query = query.is('deleted_at', null).eq('shopify_sync_status', 'error');
      } else if (statusFilter === 'all') {
        // "All" should still exclude deleted items by default
        query = query.is('deleted_at', null);
      }

      // Apply batch filter
      if (batchFilter === 'in_batch') {
        query = query.is('removed_from_batch_at', null);
      } else if (batchFilter === 'removed_from_batch') {
        query = query.not('removed_from_batch_at', 'is', null);
      } else if (batchFilter === 'current_batch' && filters.currentBatchLotId) {
        query = query.eq('lot_id', filters.currentBatchLotId).is('removed_from_batch_at', null);
      }

      // Apply print status filter
      if (printStatusFilter === 'printed') {
        query = query.not('printed_at', 'is', null);
      } else if (printStatusFilter === 'not-printed') {
        query = query.is('printed_at', null);
      }

      // Apply Shopify sync filter
      if (shopifySyncFilter === 'not-synced') {
        query = query.is('shopify_product_id', null);
      } else if (shopifySyncFilter === 'synced') {
        query = query.not('shopify_product_id', 'is', null).eq('shopify_sync_status', 'synced');
      } else if (shopifySyncFilter === 'error') {
        query = query.eq('shopify_sync_status', 'error');
      } else if (shopifySyncFilter === 'queued') {
        query = query.in('shopify_sync_status', ['queued', 'processing']);
      }

      // Apply eBay status filter
      if (ebayStatusFilter === 'not-listed') {
        query = query.is('ebay_listing_id', null);
      } else if (ebayStatusFilter === 'listed') {
        query = query.not('ebay_listing_id', 'is', null);
      } else if (ebayStatusFilter === 'queued') {
        query = query.eq('ebay_sync_status', 'queued');
      } else if (ebayStatusFilter === 'error') {
        query = query.eq('ebay_sync_status', 'error');
      }

      // Apply date range filter
      if (dateRangeFilter !== 'all') {
        const now = new Date();
        let fromDate: Date;

        switch (dateRangeFilter) {
          case 'today':
            fromDate = startOfDay(now);
            break;
          case 'yesterday':
            fromDate = startOfDay(subDays(now, 1));
            break;
          case '7days':
            fromDate = startOfDay(subDays(now, 7));
            break;
          case '30days':
            fromDate = startOfDay(subDays(now, 30));
            break;
          default:
            fromDate = startOfDay(now);
        }

        query = query.gte('created_at', fromDate.toISOString());
        
        // For yesterday, also add upper bound
        if (dateRangeFilter === 'yesterday') {
          query = query.lt('created_at', startOfDay(now).toISOString());
        }
      }

      // Apply search filter - search across multiple fields
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        
        // Split search term into words for better matching
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);
        
        // For each word, create an OR condition across all searchable fields
        searchWords.forEach(word => {
          query = query.or(
            `sku.ilike.%${word}%,brand_title.ilike.%${word}%,subject.ilike.%${word}%,card_number.ilike.%${word}%`
          );
        });
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
