import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';
import type { InventoryListItem } from '@/features/inventory/types';

export interface InventoryFilters {
  storeKey: string;
  locationGid: string | null; // null = all locations
  activeTab?: 'raw' | 'graded' | 'raw_comics' | 'graded_comics' | 'sealed'; // Now optional
  statusFilter: 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';
  batchFilter: 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch';
  printStatusFilter?: 'all' | 'printed' | 'not-printed';
  typeFilter?: 'all' | 'raw' | 'graded';
  categoryFilter?: 'all' | 'tcg' | 'comics' | 'sealed'; // New category filter
  tagFilter?: string[]; // Shopify tags filter (uses normalized_tags for filtering)
  
  searchTerm?: string;
  autoRefreshEnabled?: boolean;
  currentBatchLotId?: string | null;
  // New filters for unified hub
  shopifySyncFilter?: 'all' | 'not-synced' | 'synced' | 'queued' | 'error';
  ebayStatusFilter?: 'all' | 'not-listed' | 'listed' | 'queued' | 'error';
  dateRangeFilter?: 'all' | 'today' | 'yesterday' | '7days' | '30days';
  // Location availability filter
  locationAvailability?: 'any' | 'at-selected' | 'anywhere';
  // Smart refresh context
  hasActiveSelection?: boolean;
}

const PAGE_SIZE = 25;

export function useInventoryListQuery(filters: InventoryFilters) {
  return useInfiniteQuery({
    queryKey: [
      'inventory-list',
      filters.storeKey,
      filters.locationGid,
      filters.activeTab,
      filters.categoryFilter,
      filters.statusFilter,
      filters.batchFilter,
      filters.printStatusFilter,
      filters.typeFilter,
      
      filters.searchTerm,
      filters.currentBatchLotId,
      filters.shopifySyncFilter,
      filters.ebayStatusFilter,
      filters.dateRangeFilter,
      filters.tagFilter,
      filters.locationAvailability,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const {
        storeKey,
        locationGid,
        activeTab,
        categoryFilter = 'all',
        statusFilter,
        batchFilter,
        printStatusFilter = 'all',
        typeFilter = 'all',
        tagFilter = [],
        locationAvailability = 'any',
        
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
          updated_at,
          printed_at,
          shopify_sync_status,
          shopify_product_id,
          shopify_inventory_item_id,
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
          ebay_listing_url,
          ebay_sync_status,
          ebay_sync_error,
          list_on_ebay,
          psa_cert,
          cgc_cert,
          grading_company,
          vendor,
          year,
          category,
          variant,
          shopify_tags,
          normalized_tags
        `,
          { count: 'exact' }
        )
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .eq('store_key', storeKey);

      // Location availability filter - uses shopify_inventory_levels join
      if (locationAvailability === 'at-selected' && locationGid) {
        // Show only items with stock > 0 at the selected location
        // This requires a subquery/filter on shopify_inventory_levels
        const { data: itemsWithStock } = await supabase
          .from('shopify_inventory_levels')
          .select('inventory_item_id')
          .eq('store_key', storeKey)
          .eq('location_gid', locationGid)
          .gt('available', 0);
        
        const inventoryItemIds = (itemsWithStock || []).map(l => l.inventory_item_id);
        if (inventoryItemIds.length > 0) {
          query = query.in('shopify_inventory_item_id', inventoryItemIds);
        } else {
          // No items have stock at this location
          query = query.eq('id', 'no-match-force-empty');
        }
      } else if (locationAvailability === 'anywhere') {
        // Show only items with stock > 0 at ANY location
        const { data: itemsWithAnyStock } = await supabase
          .from('shopify_inventory_levels')
          .select('inventory_item_id')
          .eq('store_key', storeKey)
          .gt('available', 0);
        
        const uniqueInventoryItemIds = [...new Set((itemsWithAnyStock || []).map(l => l.inventory_item_id))];
        if (uniqueInventoryItemIds.length > 0) {
          query = query.in('shopify_inventory_item_id', uniqueInventoryItemIds);
        } else {
          // No items have stock anywhere
          query = query.eq('id', 'no-match-force-empty');
        }
      }

      // Only filter by location if specified and not using availability filter (which handles location)
      if (locationGid && locationAvailability !== 'at-selected') {
        query = query.eq('shopify_location_gid', locationGid);
      }

      // Apply type filter
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter === 'raw' ? 'Raw' : 'Graded');
      }

      // Apply category filter (new unified approach)
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'tcg') {
          query = query.or('main_category.is.null,main_category.eq.tcg');
        } else if (categoryFilter === 'comics') {
          query = query.eq('main_category', 'comics');
        } else if (categoryFilter === 'sealed') {
          // Sealed products: filter by shopify_snapshot tags containing 'sealed'
          // OR main_category = 'sealed' for future imports
          query = query.or('main_category.eq.sealed,shopify_snapshot->>tags.ilike.%sealed%');
        }
      } else if (activeTab) {
        // Legacy tab-based filtering (for backwards compatibility during transition)
        if (activeTab === 'raw') {
          query = query.or('main_category.is.null,main_category.eq.tcg').eq('type', 'Raw');
        } else if (activeTab === 'graded') {
          query = query.eq('type', 'Graded').or('main_category.is.null,main_category.eq.tcg');
        } else if (activeTab === 'sealed') {
          query = query.or('main_category.eq.sealed,shopify_snapshot->>tags.ilike.%sealed%');
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

      // Apply Shopify tags filter - use normalized_tags for better matching
      if (tagFilter && tagFilter.length > 0) {
        // Filter items that have ANY of the selected tags (using normalized tags)
        // Try normalized_tags first, fall back to shopify_tags for items not yet normalized
        query = query.or(
          `normalized_tags.ov.{${tagFilter.join(',')}},shopify_tags.ov.{${tagFilter.join(',')}}`
        );
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

      // Cast to typed items - the query columns match InventoryListItem
      const typedItems = (data || []) as InventoryListItem[];

      return { 
        items: typedItems, 
        count: count || 0,
        nextCursor: typedItems.length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined
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
    // Smart auto-refresh based on context
    refetchInterval: (query) => {
      // No auto-refresh if user has selected items (editing mode)
      if (filters.hasActiveSelection) return false;
      
      // No auto-refresh if disabled
      if (!filters.autoRefreshEnabled) return false;
      
      // Check for pending syncs - refresh faster
      const data = query.state.data;
      const hasPendingSyncs = data?.pages?.some((p: any) => 
        p.items?.some((i: any) => 
          i.shopify_sync_status === 'queued' || 
          i.shopify_sync_status === 'processing' ||
          i.ebay_sync_status === 'queued' ||
          i.ebay_sync_status === 'processing'
        )
      );
      
      // Fast refresh when syncs pending (15 seconds)
      if (hasPendingSyncs) return 15000;
      
      // Check if tab is visible
      if (typeof document !== 'undefined' && !document.hasFocus()) {
        // Slow refresh when tab is hidden (5 minutes)
        return 300000;
      }
      
      // Normal refresh (1 minute)
      return 60000;
    },
    enabled: Boolean(filters.storeKey),
  });
}
