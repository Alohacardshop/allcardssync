import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { toast } from "sonner";
import { AllLocationsSelector } from "@/components/AllLocationsSelector";
import { StoreSelector } from "@/components/StoreSelector";
import { useStore } from "@/contexts/StoreContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, AlertTriangle, ShoppingCart, Printer, Trash2, Undo } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { usePrintNode } from "@/hooks/usePrintNode";
import { generateLabelTSPL } from "@/lib/labelTemplates";
import { ShopifyRemovalDialog } from "@/components/ShopifyRemovalDialog";

// Simple SEO helpers without extra deps
function useSEO(opts: { title: string; description?: string; canonical?: string }) {
  useEffect(() => {
    document.title = opts.title;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", opts.description || "");
    else if (opts.description) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = opts.description;
      document.head.appendChild(m);
    }

    const linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = opts.canonical || window.location.href;
    if (linkCanonical) linkCanonical.href = href;
    else {
      const l = document.createElement("link");
      l.rel = "canonical";
      l.href = href;
      document.head.appendChild(l);
    }
  }, [opts.title, opts.description, opts.canonical]);
}

// Helper to build a human title similar to the intake page
function buildTitleFromParts(
  year?: string | null,
  brandTitle?: string | null,
  cardNumber?: string | null,
  subject?: string | null,
  variant?: string | null
) {
  return [
    year,
    (brandTitle || "").replace(/&amp;/g, "&"),
    cardNumber ? `#${String(cardNumber).replace(/^#/, "")}` : undefined,
    (subject || "").replace(/&amp;/g, "&"),
    (variant || "").replace(/&amp;/g, "&"),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

const pageSize = 20;

type ItemRow = {
  id: string;
  lot_number: string;
  created_at: string;
  updated_at: string;
  price: number | null;
  cost: number | null;
  printed_at: string | null;
  pushed_at: string | null;
  year: string | null;
  brand_title: string | null;
  subject: string | null;
  category: string | null;
  variant: string | null;
  card_number: string | null;
  grade: string | null;
  psa_cert: string | null;
  sku: string | null;
  quantity: number | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
  shopify_location_gid: string | null;
  source_provider: string | null;
  shopify_sync_status: string | null;
  last_shopify_synced_at: string | null;
  last_shopify_sync_error: string | null;
  store_key: string | null;
  removed_from_batch_at: string | null;
};

export default function Inventory() {
  const { selectedStore } = useStore();
  const [selectedLocationGid, setSelectedLocationGid] = useState<string | null>(null);
  const { selectedPrinter, printRAW, isConnected: isPrintNodeConnected } = usePrintNode();
  
  useSEO({
    title: "Card Inventory | Aloha",
    description: "View all cards in inventory with lot numbers, IDs, status, price, and more.",
  });

  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isEstimated, setIsEstimated] = useState(true);
  const [search, setSearch] = useState("");
  const [printed, setPrinted] = useState<"all" | "printed" | "unprinted">("all");
  const [pushed, setPushed] = useState<"all" | "pushed" | "unpushed">("all");
  const [lotFilter, setLotFilter] = useState("");
  const [sortKey, setSortKey] = useState<keyof ItemRow>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  
  // Shopify sync state
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  
  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    items: ItemRow[];
    isBulk: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    items: [],
    isBulk: false
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
  // Undo functionality
  const [undoTimers, setUndoTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [showDeletedToggle, setShowDeletedToggle] = useState(false);
  
  // Shopify removal dialog state
  const [removalDialog, setRemovalDialog] = useState<{
    isOpen: boolean;
    items: ItemRow[];
    onConfirm?: (mode: 'auto' | 'graded' | 'raw') => void;
  }>({
    isOpen: false,
    items: []
  });
  const [removalProcessing, setRemovalProcessing] = useState(false);
  
  // New filters
  const [typeFilter, setTypeFilter] = useState<"all" | "graded" | "raw">("all");
  const [conditionFilter, setConditionFilter] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });

  // Diagnostic state and fetch management
  const [diagnostics, setDiagnostics] = useState<{
    user: any;
    roles: string[];
    locations: string[];
    itemCount: number;
    accessTest?: boolean;
  } | null>(null);
  const [fetchId, setFetchId] = useState(0);
  const [fetchStartTime, setFetchStartTime] = useState<number | null>(null);
  const [timeoutBanner, setTimeoutBanner] = useState<string | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // Fetch diagnostics on mount and comprehensive diagnostics function
  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      console.log('Running inventory diagnostics...');
      const startTime = Date.now();
      
      // 1. Auth check
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      // 2. Roles check
      const roles: string[] = [];
      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        roles.push(...(roleData?.map(r => r.role) || []));
      }

      // 3. Location assignments
      const { data: locationData } = await supabase
        .from('user_shopify_assignments')
        .select('location_gid')
        .eq('user_id', user?.id || '');

      // 4. Access test - try to fetch 1 item
      let accessTest = false;
      try {
        const { data: testItem, error: accessError } = await supabase
          .from('intake_items')
          .select('id')
          .is('deleted_at', null)
          .limit(1);
        accessTest = !accessError;
        if (accessError) console.warn('Access test failed:', accessError);
      } catch (e) {
        console.warn('Access test exception:', e);
      }

      // 5. Quick count probe
      const { count: itemCount } = await supabase
        .from('intake_items')
        .select('*', { count: 'estimated', head: true })
        .is('deleted_at', null);

      const duration = Date.now() - startTime;
      
      const result = {
        user,
        roles,
        locations: locationData?.map(l => l.location_gid) || [],
        itemCount: itemCount || 0,
        accessTest
      };
      
      setDiagnostics(result);
      console.log(`Diagnostics completed in ${duration}ms:`, result);
      toast.success(`Diagnostics completed in ${duration}ms`);
      
    } catch (err) {
      console.error('Diagnostics error:', err);
      toast.error('Diagnostics failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRunningDiagnostics(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
    
    // Debug helper for diagnostics
    if (typeof window !== 'undefined') {
      (window as any).debugDeleteRPC = async (itemId: string) => {
        console.log('Testing soft_delete_intake_item RPC with item:', itemId);
        try {
          const { data, error, status } = await supabase.rpc('soft_delete_intake_item', {
            item_id: itemId,
            reason_in: 'diagnostic test'
          });
          console.log('[debug] RPC response:', { data, error, status });
          if (error) {
            console.error('[debug] RPC error details:', { message: error.message, details: error.details, hint: error.hint });
            toast.error(`RPC Error: ${error.message || error.details || error.hint}`);
          } else {
            console.log('[debug] Success response:', data);
            toast.success('Diagnostic delete successful (check console)');
          }
        } catch (e) {
          console.error('[debug] Exception:', e);
          toast.error(`Exception: ${e}`);
        }
      };
    }
  }, []);

  // Optimized query builder function
  const buildInventoryQuery = (countMode: 'estimated' | 'exact' = 'estimated') => {
    // Only select columns we actually need for display
    const columns = [
      'id', 'lot_number', 'created_at', 'updated_at', 'price', 'cost', 
      'printed_at', 'pushed_at', 'year', 'brand_title', 'subject', 
      'category', 'variant', 'card_number', 'grade', 'psa_cert', 'sku', 
      'quantity', 'shopify_product_id', 'shopify_variant_id', 
      'shopify_inventory_item_id', 'shopify_location_gid', 'source_provider',
      'shopify_sync_status', 'last_shopify_synced_at', 'last_shopify_sync_error',
      'store_key', 'removed_from_batch_at'
    ].join(',');

    let query = supabase
      .from("intake_items")
      .select(columns, { count: countMode })
      .order(sortKey as string, { ascending: sortAsc });

    // ALWAYS exclude soft-deleted items (centrally controlled)
    if (!showDeletedToggle) {
      query = query.is("deleted_at", null);
    }

    // Filter by location if selected
    if (selectedLocationGid) {
      query = query.eq("shopify_location_gid", selectedLocationGid);
    }

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        [
          `brand_title.ilike.${term}`,
          `subject.ilike.${term}`,
          `category.ilike.${term}`,
          `variant.ilike.${term}`,
          `card_number.ilike.${term}`,
          `year.ilike.${term}`,
          `psa_cert.ilike.${term}`,
          `sku.ilike.${term}`,
          `lot_number.ilike.${term}`,
          `grade.ilike.${term}`,
        ].join(",")
      );
    }

    if (lotFilter.trim()) {
      query = query.ilike("lot_number", `%${lotFilter.trim()}%`);
    }

    if (printed === "printed") query = query.not("printed_at", "is", null);
    if (printed === "unprinted") query = query.is("printed_at", null);
    if (pushed === "pushed") query = query.not("pushed_at", "is", null);
    if (pushed === "unpushed") query = query.is("pushed_at", null);

    // Type filter logic
    if (typeFilter === "graded") {
      query = query.not("psa_cert", "is", null);
    } else if (typeFilter === "raw") {
      query = query.is("psa_cert", null);
    }

    if (conditionFilter.trim()) {
      query = query.ilike("grade", `%${conditionFilter.trim()}%`);
    }

    if (setFilter.trim()) {
      query = query.ilike("brand_title", `%${setFilter.trim()}%`);
    }

    if (categoryFilter.trim()) {
      query = query.ilike("category", `%${categoryFilter.trim()}%`);
    }

    if (yearFilter.trim()) {
      query = query.ilike("year", `%${yearFilter.trim()}%`);
    }

    if (priceRange.min.trim()) {
      const minPrice = parseFloat(priceRange.min);
      if (!isNaN(minPrice)) {
        query = query.gte("price", minPrice);
      }
    }

    if (priceRange.max.trim()) {
      const maxPrice = parseFloat(priceRange.max);
      if (!isNaN(maxPrice)) {
        query = query.lte("price", maxPrice);
      }
    }

    return query;
  };

  // Split fetch: First get items quickly, then count in background
  useEffect(() => {
    let abortController = new AbortController();
    let watchdogTimer: NodeJS.Timeout;
    
    const fetchData = async () => {
      const currentFetchId = Date.now();
      setFetchId(currentFetchId);
      setLoading(true);
      setError(null);
      setTimeoutBanner(null);
      setFetchStartTime(currentFetchId);
      
      // Shorter watchdog timer (10 seconds)
      watchdogTimer = setTimeout(() => {
        if (!abortController.signal.aborted) {
          console.error(`[${currentFetchId}] Watchdog: Request stuck after 10s, aborting`);
          abortController.abort();
          setTimeoutBanner('Request timed out after 10 seconds. The database may be under heavy load.');
          setError('Request timed out. Click "Retry" to try again.');
          setLoading(false);
          setFetchStartTime(null);
        }
      }, 10000);
      
      try {
        console.log(`[${currentFetchId}] Loading intake items from DB...`);
        
        // Step 1: Fast items-only fetch (no count)
        const query = buildInventoryQuery();
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await query
          .range(from, to)
          .abortSignal(abortController.signal);
        
        if (abortController.signal.aborted) {
          console.log(`[${currentFetchId}] Items query aborted`);
          return;
        }

        if (error) {
          console.error(`[${currentFetchId}] Inventory fetch error:`, error);
          throw new Error(`Database error: ${error.message || error.hint || 'Unknown PostgREST error'}`);
        }
        
        const duration = Date.now() - currentFetchId;
        setItems((data as any) || []);
        console.log(`[${currentFetchId}] Loaded ${(data || []).length} items (${duration}ms)`);
        setLoading(false);
        setFetchStartTime(null);
        
        // Step 2: Background count fetch (estimated, then exact if needed)
        setTimeout(async () => {
          try {
            const countQuery = buildInventoryQuery('estimated');
            const { count: estimatedCount } = await countQuery
              .range(0, 0)
              .abortSignal(abortController.signal);
              
            if (!abortController.signal.aborted) {
              setTotal(estimatedCount || 0);
              setIsEstimated(true);
              console.log(`[${currentFetchId}] Got estimated count: ~${estimatedCount}`);
            }
          } catch (e) {
            console.warn(`[${currentFetchId}] Count fetch failed:`, e);
          }
        }, 100);
        
      } catch (e: any) {
        if (!abortController.signal.aborted) {
          console.error(`[${currentFetchId}] Fetch error:`, e);
          if (e.name === 'AbortError') {
            setError('Request was cancelled');
          } else {
            const errorMsg = e.message || 'Failed to load inventory';
            setError(errorMsg);
            
            // Show specific PostgREST error details if available
            if (e.code || e.hint || e.details) {
              console.error(`PostgREST Error Details:`, {
                code: e.code,
                hint: e.hint, 
                details: e.details
              });
            }
          }
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          setFetchStartTime(null);
        }
        clearTimeout(watchdogTimer);
      }
    };

    // Debounce rapid changes (500ms)
    const timeoutId = setTimeout(fetchData, 500);
    
    return () => {
      abortController.abort();
      clearTimeout(timeoutId);
      clearTimeout(watchdogTimer);
    };
  }, [page, search, printed, pushed, lotFilter, sortKey, sortAsc, typeFilter, conditionFilter, setFilter, categoryFilter, yearFilter, priceRange, selectedLocationGid]);

  // Function to retry fetch
  const retryFetch = () => {
    setError(null);
    setLoading(false);
    // Force a re-fetch by updating a dependency
    setFetchId(prev => prev + 1);
  };
  const getExactCount = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      console.log('Getting exact count...');
      const startTime = Date.now();
      const query = buildInventoryQuery('exact');
      const { count, error } = await query.range(0, 0);
      
      if (error) throw error;
      
      const duration = Date.now() - startTime;
      setTotal(count || 0);
      setIsEstimated(false);
      console.log(`Got exact count: ${count} (${duration}ms)`);
      toast.success(`Exact count: ${count?.toLocaleString()} items`);
    } catch (e: any) {
      console.error('Exact count error:', e);
      toast.error('Failed to get exact count: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Clear selection when page or filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, printed, pushed, lotFilter, typeFilter, conditionFilter, setFilter, categoryFilter, yearFilter, priceRange, selectedLocationGid]);

  const toggleSort = (key: keyof ItemRow) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handlePushToShopify = async (itemIds: string[]) => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    if (itemIds.length === 0) {
      toast.error("No items selected");
      return;
    }

    setProcessingIds(prev => new Set([...prev, ...itemIds]));

    try {
      // Fetch full item data for the selected IDs
      const { data: fullItems, error: fetchError } = await supabase
        .from("intake_items")
        .select("*")
        .in("id", itemIds)
        .is("deleted_at", null);

      if (fetchError) throw fetchError;

      if (!fullItems || fullItems.length === 0) {
        throw new Error("No items found to push");
      }

      // Filter out items that are already pushed
      const unpushedItems = fullItems.filter(item => !item.pushed_at);
      
      if (unpushedItems.length === 0) {
        toast.info("All selected items have already been pushed to Shopify");
        return;
      }

      if (unpushedItems.length < fullItems.length) {
        toast.info(`Skipping ${fullItems.length - unpushedItems.length} items that are already pushed`);
      }

      // Check for items with missing prices (will default to 99999)
      const itemsWithMissingPrices = unpushedItems.filter(item => !item.price);
      if (itemsWithMissingPrices.length > 0) {
        toast.warning(`${itemsWithMissingPrices.length} items have no price and will default to $99,999`);
      }

      // Push to Shopify using the existing edge function
      const { error } = await supabase.functions.invoke("shopify-import", {
        body: {
          items: unpushedItems,
          storeKey: selectedStore
        }
      });

      if (error) throw error;

      toast.success(`Successfully pushed ${unpushedItems.length} items to Shopify`);
      
      // Refresh using optimized query
      const fetchData = async () => {
        setLoading(true);
        try {
          const query = buildInventoryQuery('estimated');
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await query.range(from, to);

          if (error) throw error;

          setItems((data as any) || []);
          setTotal(count || 0);
          setIsEstimated(true);
        } catch (e: any) {
          console.error('Refresh error:', e);
        } finally {
          setLoading(false);
        }
      };
      
      await fetchData();
      
      // Clear selection
      setSelectedIds(new Set());

    } catch (e) {
      console.error(e);
      toast.error("Failed to push items to Shopify: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        itemIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  const handleBulkPush = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select items to push");
      return;
    }
    handlePushToShopify(Array.from(selectedIds));
  };

  const handleSinglePush = (itemId: string) => {
    handlePushToShopify([itemId]);
  };

  // Manual Shopify sync functions
  const handleSyncToShopify = async (itemIds: string[]) => {
    if (itemIds.length === 0) {
      toast.error("No items selected for sync");
      return;
    }

    setSyncingIds(prev => new Set([...prev, ...itemIds]));

    try {
      // Get the items to sync
      const { data: itemsToSync, error: fetchError } = await supabase
        .from('intake_items')
        .select('*')
        .in('id', itemIds)
        .is('deleted_at', null)
        .not('removed_from_batch_at', 'is', null); // Only inventory items

      if (fetchError) throw fetchError;

      if (!itemsToSync || itemsToSync.length === 0) {
        toast.error("No valid inventory items found to sync");
        return;
      }

      // First validate all items
      const validationPromises = itemsToSync.map(async (item) => {
        if (!item.sku || !item.store_key) {
          return {
            item,
            valid: false,
            error: 'Missing SKU or store_key'
          };
        }

        const response = await supabase.functions.invoke('shopify-sync-inventory', {
          body: {
            storeKey: item.store_key,
            sku: item.sku,
            locationGid: item.shopify_location_gid,
            correlationId: `validate-${item.id}`,
            validateOnly: true
          }
        });

        return {
          item,
          valid: response.data?.valid === true,
          error: response.data?.validation_error || response.error?.message
        };
      });

      const validationResults = await Promise.all(validationPromises);
      const validItems = validationResults.filter(r => r.valid).map(r => r.item);
      const invalidItems = validationResults.filter(r => !r.valid);

      // Show validation errors
      if (invalidItems.length > 0) {
        const firstError = invalidItems[0].error;
        toast.error(`Validation failed for ${invalidItems.length} item(s): ${firstError}`);
        
        // Mark invalid items with error status
        for (const { item, error } of invalidItems) {
          await supabase
            .from('intake_items')
            .update({
              shopify_sync_status: 'error',
              last_shopify_sync_error: error
            })
            .eq('id', item.id);
        }
      }

      if (validItems.length === 0) {
        return;
      }

      // Now sync only valid items
      const correlationId = `manual_sync_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const syncPromises = validItems.map(item => {
        return supabase.functions.invoke('shopify-sync-inventory', {
          body: {
            storeKey: item.store_key,
            sku: item.sku,
            locationGid: item.shopify_location_gid,
            correlationId
          }
        }).then(response => {
          if (response.error) {
            console.error('Sync failed for item:', item.id, response.error);
            return { success: false, error: response.error.message, itemId: item.id };
          }
          return { success: true, data: response.data, itemId: item.id };
        });
      });

      const results = await Promise.all(syncPromises);
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      // Update sync status for successful items
      const now = new Date().toISOString();
      const successfulIds = results.filter(r => r.success).map(r => r.itemId);
      if (successfulIds.length > 0) {
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'synced',
            last_shopify_synced_at: now,
            last_shopify_sync_error: null
          })
          .in('id', successfulIds);
      }

      // Update failed items with error status
      const failedResults = results.filter(r => !r.success);
      for (const result of failedResults) {
        await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'error',
            last_shopify_sync_error: result.error || 'Sync failed - check logs for details'
          })
          .eq('id', result.itemId);
      }

      if (successCount > 0) {
        toast.success(`Successfully synced ${successCount} items to Shopify`);
      }
      if (failureCount > 0) {
        toast.error(`Failed to sync ${failureCount} items`);
      }

      // Refresh the data to show updated sync status
      setPage(1);
      // Force a refresh by changing a query parameter
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('refresh', Date.now().toString());
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
      window.location.reload();

    } catch (error) {
      console.error('Sync error:', error);
      toast.error("Failed to sync to Shopify: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const handleBulkSync = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select items to sync");
      return;
    }
    handleSyncToShopify(Array.from(selectedIds));
  };

  const handleSingleSync = (itemId: string) => {
    handleSyncToShopify([itemId]);
  };

  const handlePrintLabel = async (item: ItemRow) => {
    if (!selectedPrinter) {
      toast.error("No printer selected. Please configure PrintNode settings.");
      return;
    }

    try {
      const title = buildTitleFromParts(item.year, item.brand_title, item.card_number, item.subject, item.variant);
      const labelData = {
        title: title || "Card",
        sku: item.psa_cert || item.sku || item.id,
        price: item.price ? `$${item.price}` : "$0.00",
        lot: item.lot_number,
        condition: item.grade || "Near Mint",
        barcode: item.sku || item.id
      };

      const tsplCode = generateLabelTSPL('graded-card', labelData);
      await printRAW(tsplCode, { title: `Label - ${title}` });
      
      // Update printed_at timestamp
      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .eq('id', item.id);

      toast.success("Label printed successfully");
      
      // Refresh the current page data
      window.location.reload();
      
    } catch (error) {
      console.error('Print error:', error);
      toast.error("Failed to print label: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handlePushAndPrint = async (itemIds: string[]) => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    if (!selectedPrinter) {
      toast.error("No printer selected. Please configure PrintNode settings.");
      return;
    }

    if (itemIds.length === 0) {
      toast.error("No items selected");
      return;
    }

    setProcessingIds(prev => new Set([...prev, ...itemIds]));

    try {
      // First push to Shopify
      await handlePushToShopify(itemIds);
      
      // Then print labels for all items
      const { data: itemsToPrint, error: fetchError } = await supabase
        .from("intake_items")
        .select("*")
        .in("id", itemIds)
        .is("deleted_at", null);

      if (fetchError) throw fetchError;

      if (itemsToPrint && itemsToPrint.length > 0) {
        for (const item of itemsToPrint) {
          const title = buildTitleFromParts(item.year, item.brand_title, item.card_number, item.subject, item.variant);
          const labelData = {
            title: title || "Card",
            sku: item.psa_cert || item.sku || item.id,
            price: item.price ? `$${item.price}` : "$0.00",
            lot: item.lot_number,
            condition: item.grade || "Near Mint",
            barcode: item.sku || item.id
          };

          const tsplCode = generateLabelTSPL('graded-card', labelData);
          await printRAW(tsplCode, { title: `Label - ${title}` });
        }

        // Update printed_at timestamp for all items
        await supabase
          .from('intake_items')
          .update({ printed_at: new Date().toISOString() })
          .in('id', itemIds);

        toast.success(`Successfully pushed ${itemsToPrint.length} items to Shopify and printed labels`);
      }

    } catch (error) {
      console.error('Push and print error:', error);
      toast.error("Failed to push and print: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        itemIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  const handleBulkPushAndPrint = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select items to push and print");
      return;
    }
    handlePushAndPrint(Array.from(selectedIds));
  };

  const handleSinglePushAndPrint = (itemId: string) => {
    handlePushAndPrint([itemId]);
  };

  const handleDeleteRow = async (row: ItemRow) => {
    const isMirrored = row.shopify_product_id || 
                      (row.sku && row.source_provider === 'shopify-pull');
    if (isMirrored) {
      // Show Shopify removal dialog for mirrored items
      setRemovalDialog({
        isOpen: true,
        items: [row],
        onConfirm: async (mode) => {
          setRemovalProcessing(true);
          try {
            // First apply Shopify removal
            const { error: shopifyError } = await supabase.functions.invoke("shopify-remove-or-zero", {
              body: {
                storeKey: selectedStore,
                mode,
                productId: row.shopify_product_id,
                sku: row.sku,
                locationGid: row.shopify_location_gid
              }
            });

            if (shopifyError) {
              console.error('Shopify removal error:', shopifyError);
              toast.error("Shopify removal failed: " + shopifyError.message);
              return;
            }

            // Then delete using RPC
            await performRPCDelete(row.id, 'Removed from Shopify and deleted');
            
            setRemovalDialog({ isOpen: false, items: [] });
          } catch (error) {
            console.error('Removal error:', error);
            toast.error("Failed to remove item: " + (error instanceof Error ? error.message : "Unknown error"));
          } finally {
            setRemovalProcessing(false);
          }
        }
      });
    } else {
      // Show confirmation dialog for non-mirrored items
      setDeleteDialog({
        isOpen: true,
        items: [row],
        isBulk: false,
        onConfirm: () => performRPCDelete(row.id, 'Deleted from Inventory UI')
      });
    }
  };

  // RPC-based delete functions
  const performRPCDelete = async (itemId: string, reason = 'Deleted from Inventory UI') => {
    setDeletingId(itemId);
    
    try {
      const { data, error, status } = await supabase.rpc('soft_delete_intake_item', {
        item_id: itemId,
        reason_in: reason,
      });

      if (error) {
        console.error('[delete] RPC error', { status, ...error });
        throw new Error(error.message || error.details || error.hint || `RPC failed (status ${status})`);
      }
      
      // Update UI immediately
      setItems(prev => prev.filter(item => item.id !== itemId));
      setTotal(prev => Math.max(0, prev - 1));
      
      // Show success toast with undo option
      const undoToastId = toast.success(
        <div className="flex items-center justify-between w-full">
          <span>Item deleted. Undo available for 10s.</span>
          <button
            onClick={() => undoDelete(itemId, undoToastId)}
            className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/80"
          >
            Undo
          </button>
        </div>,
        { duration: 10000 }
      );
      
      // Start undo timer
      startUndoTimer(itemId, undoToastId);
      
    } catch (e: any) {
      console.warn('[delete] falling back to direct update:', e?.message || e);
      
      try {
        const { error: fbError } = await supabase
          .from('intake_items')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_reason: 'fallback delete',
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemId)
          .select('id')
          .single();

        if (fbError) {
          console.error('[delete] fallback failed', fbError);
          toast.error(`Delete failed: ${fbError.message || fbError.details || 'unknown error'}`);
          setDeletingId(null);
          return;
        }
        
        // Update UI immediately
        setItems(prev => prev.filter(item => item.id !== itemId));
        setTotal(prev => Math.max(0, prev - 1));
        
        // Show success toast with undo option
        const undoToastId = toast.success(
          <div className="flex items-center justify-between w-full">
            <span>Item deleted (fallback). Undo still available.</span>
            <button
              onClick={() => undoDelete(itemId, undoToastId)}
              className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/80"
            >
              Undo
            </button>
          </div>,
          { duration: 10000 }
        );
        
        // Start undo timer
        startUndoTimer(itemId, undoToastId);
        
      } catch (fallbackError: any) {
        console.error('[delete] fallback also failed', fallbackError);
        toast.error(`Delete completely failed: ${fallbackError.message || 'unknown error'}`);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const performBulkRPCDelete = async (itemIds: string[]) => {
    setBulkDeleting(true);
    try {
      const { data, error } = await supabase.rpc('soft_delete_intake_items', {
        ids: itemIds,
        reason: 'Bulk delete from Inventory'
      });

      if (error) {
        throw new Error(error.message || error.hint || error.details || 'Bulk delete failed');
      }
      
      // Update UI immediately
      setItems(prev => prev.filter(item => !itemIds.includes(item.id)));
      setTotal(prev => Math.max(0, prev - itemIds.length));
      setSelectedIds(new Set());
      
      toast.success(`${itemIds.length} items deleted successfully`);
      
    } catch (error: any) {
      console.error('Bulk delete failed:', error);
      toast.error(`Bulk delete failed: ${error.message ?? String(error)}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const undoDelete = async (itemId: string, toastId?: string | number) => {
    try {
      const { error } = await supabase.rpc('restore_intake_item', {
        item_id: itemId,
        reason_in: 'Undo from Inventory UI'
      });
      
      if (error) throw error;
      
      toast.success('Item restored successfully');
      
      // Clear the undo timer
      const timer = undoTimers.get(itemId);
      if (timer) {
        clearTimeout(timer);
        setUndoTimers(prev => {
          const newMap = new Map(prev);
          newMap.delete(itemId);
          return newMap;
        });
      }
      
      // Dismiss the original toast
      if (toastId) {
        toast.dismiss(toastId);
      }
      
      // Refresh the list to show the restored item
      window.location.reload();
      
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message || e}`);
    }
  };

  const startUndoTimer = (itemId: string, toastId?: string | number) => {
    const timer = setTimeout(() => {
      // Remove from undo timers after 10 seconds
      setUndoTimers(prev => {
        const newMap = new Map(prev);
        newMap.delete(itemId);
        return newMap;
      });
    }, 10000);
    
    setUndoTimers(prev => new Map(prev).set(itemId, timer));
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      undoTimers.forEach(timer => clearTimeout(timer));
    };
  }, [undoTimers]);

  const performLocalDelete = async (row: ItemRow) => {
    const reason = window.prompt("Delete reason (optional)?") || null;
    try {
      const { error } = await supabase
        .from("intake_items")
        .update({ deleted_at: new Date().toISOString(), deleted_reason: reason })
        .eq("id", row.id);
      if (error) throw error;
      setItems((prev) => prev.filter((it) => it.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success(`Deleted Lot ${row.lot_number}${reason ? ` (${reason})` : ""}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete item");
      throw e;
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select items to delete");
      return;
    }

    const selectedItems = items.filter(item => selectedIds.has(item.id));
    const mirroredItems = selectedItems.filter(item => 
      item.shopify_product_id || 
      (item.sku && item.source_provider === 'shopify-pull')
    );

    if (mirroredItems.length > 0) {
      // Show Shopify removal dialog for bulk delete
      setRemovalDialog({
        isOpen: true,
        items: selectedItems,
        onConfirm: async (mode) => {
          setRemovalProcessing(true);
          try {
            // Process Shopify removals for mirrored items
            const results = await Promise.allSettled(
              mirroredItems.map(item =>
                supabase.functions.invoke("shopify-remove-or-zero", {
                  body: {
                    storeKey: selectedStore,
                    mode,
                    productId: item.shopify_product_id,
                    sku: item.sku,
                    locationGid: item.shopify_location_gid
                  }
                })
              )
            );

            const failures = results.filter(r => r.status === 'rejected').length;
            if (failures > 0) {
              toast.warning(`${failures} Shopify removals failed, but continuing with local deletion`);
            }

            // Then delete all selected items using bulk RPC
            await performBulkRPCDelete(Array.from(selectedIds));
            
            setRemovalDialog({ isOpen: false, items: [] });
          } catch (error) {
            console.error('Bulk removal error:', error);
            toast.error("Failed to remove items: " + (error instanceof Error ? error.message : "Unknown error"));
          } finally {
            setRemovalProcessing(false);
          }
        }
      });
    } else {
      // Show confirmation dialog for bulk delete
      setDeleteDialog({
        isOpen: true,
        items: selectedItems,
        isBulk: true,
        onConfirm: () => performBulkRPCDelete(Array.from(selectedIds))
      });
    }
  };

  // Legacy function removed - replaced with performBulkRPCDelete

  const clearAllFilters = () => {
    setSearch("");
    setLotFilter("");
    setPrinted("all");
    setPushed("all");
    setTypeFilter("all");
    setConditionFilter("");
    setSetFilter("");
    setCategoryFilter("");
    setYearFilter("");
    setPriceRange({ min: "", max: "" });
    setSelectedLocationGid(null);
    setPage(1);
    setSelectedIds(new Set()); // Clear selection on filter clear
  };

  useEffect(() => {
    const channel = supabase
      .channel('inventory-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'intake_items' }, (payload) => {
        const row: any = payload.new;
        setItems((prev) => prev.map((it) => it.id === row.id ? { ...it, quantity: row.quantity, pushed_at: row.pushed_at, printed_at: row.printed_at } : it));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Card Inventory</h1>
            <p className="text-muted-foreground mt-1">Search and manage all items that have been added to your queue.</p>
          </div>
          <Navigation />
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <Card className="shadow-aloha">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CardTitle>Inventory List</CardTitle>
                {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                 {!loading && total > 0 && (
                   <div className="flex items-center gap-2">
                     <span className="text-sm text-muted-foreground">
                       {items.length} of {isEstimated ? '~' : ''}{total.toLocaleString()} items
                       {isEstimated && (
                         <button
                           onClick={getExactCount}
                           className="ml-2 text-xs text-primary hover:underline"
                           title="Get exact count"
                         >
                           (get exact)
                         </button>
                       )}
                     </span>
                   </div>
                 )}
              </div>
              <div className="flex items-center gap-2">
                <StoreSelector />
                {error && (
                  <Button variant="outline" size="sm" onClick={retryFetch}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                )}
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear All Filters
                </Button>
              </div>
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    variant="ghost"
                  >
                    Clear selection
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleBulkPush}
                    disabled={!selectedStore || processingIds.size > 0}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Push to Shopify ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkSync}
                    disabled={syncingIds.size > 0}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncingIds.size > 0 ? 'animate-spin' : ''}`} />
                    Sync to Shopify ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkPushAndPrint}
                    disabled={!selectedStore || !isPrintNodeConnected || processingIds.size > 0}
                    className="flex items-center gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <Printer className="h-4 w-4" />
                    Push + Print ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={processingIds.size > 0}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete ({selectedIds.size})
                  </Button>
                </div>
              </div>
            )}
            
            {/* Timeout Banner */}
            {timeoutBanner && (
              <Alert className="mt-4" variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {timeoutBanner}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Diagnostics Panel */}
            {diagnostics && (process.env.NODE_ENV === 'development' || diagnostics.itemCount === 0) && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Diagnostics</h4>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={runDiagnostics}
                    disabled={runningDiagnostics}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${runningDiagnostics ? 'animate-spin' : ''}`} />
                    Re-run
                  </Button>
                </div>
                <div className="text-sm space-y-1">
                  <div><strong>Auth:</strong> {diagnostics.user ? `✅ ${diagnostics.user.email}` : '❌ Not logged in'}</div>
                  <div><strong>Roles:</strong> {diagnostics.roles.length > 0 ? diagnostics.roles.join(', ') : 'None'}</div>
                  <div><strong>Locations:</strong> {diagnostics.locations.length > 0 ? `${diagnostics.locations.length} assigned` : 'None'}</div>
                  <div><strong>Access Test:</strong> {diagnostics.accessTest ? '✅ Database accessible' : '❌ Access denied'}</div>
                  <div><strong>Total Items:</strong> {diagnostics.itemCount}</div>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <Alert className="mt-4" variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {error}. Try refreshing the page or contact support if the issue persists.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            {/* Primary Filters Row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => {
                    setPage(1);
                    setSearch(e.target.value);
                  }}
                  placeholder="Search title, SKU, cert, etc."
                />
              </div>
              <div>
                <Label htmlFor="lot-filter">Filter by Lot</Label>
                <Input
                  id="lot-filter"
                  value={lotFilter}
                  onChange={(e) => {
                    setPage(1);
                    setLotFilter(e.target.value);
                  }}
                  placeholder="LOT-123456"
                />
              </div>
              <div>
                <Label>Location Filter</Label>
                <AllLocationsSelector
                  value={selectedLocationGid}
                  onValueChange={(locationGid) => {
                    setPage(1);
                    setSelectedLocationGid(locationGid);
                  }}
                  placeholder="All locations"
                />
              </div>
              <div>
                <Label>Card Type</Label>
                <Select value={typeFilter} onValueChange={(value: "all" | "graded" | "raw") => {
                  setPage(1);
                  setTypeFilter(value);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="graded">Graded (PSA)</SelectItem>
                    <SelectItem value="raw">Raw Cards</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Secondary Filters Row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div>
                <Label htmlFor="condition-filter">Condition/Grade</Label>
                <Input
                  id="condition-filter"
                  value={conditionFilter}
                  onChange={(e) => {
                    setPage(1);
                    setConditionFilter(e.target.value);
                  }}
                  placeholder="GEM MT 10, Near Mint, etc."
                />
              </div>
              <div>
                <Label htmlFor="set-filter">Set/Brand</Label>
                <Input
                  id="set-filter"
                  value={setFilter}
                  onChange={(e) => {
                    setPage(1);
                    setSetFilter(e.target.value);
                  }}
                  placeholder="Base Set, Sword & Shield, etc."
                />
              </div>
              <div>
                <Label htmlFor="category-filter">Category</Label>
                <Input
                  id="category-filter"
                  value={categoryFilter}
                  onChange={(e) => {
                    setPage(1);
                    setCategoryFilter(e.target.value);
                  }}
                  placeholder="TCG Cards, Pokemon, etc."
                />
              </div>
              <div>
                <Label htmlFor="year-filter">Year</Label>
                <Input
                  id="year-filter"
                  value={yearFilter}
                  onChange={(e) => {
                    setPage(1);
                    setYearFilter(e.target.value);
                  }}
                  placeholder="1999, 2021, etc."
                />
              </div>
              <div>
                <Label>Price Range</Label>
                <div className="flex gap-2">
                  <Input
                    value={priceRange.min}
                    onChange={(e) => {
                      setPage(1);
                      setPriceRange(prev => ({ ...prev, min: e.target.value }));
                    }}
                    placeholder="Min $"
                    type="number"
                  />
                  <Input
                    value={priceRange.max}
                    onChange={(e) => {
                      setPage(1);
                      setPriceRange(prev => ({ ...prev, max: e.target.value }));
                    }}
                    placeholder="Max $"
                    type="number"
                  />
                </div>
              </div>
            </div>

            {/* Sort Controls Row */}
            <div className="grid gap-4 mb-4">
              <div>
                <Label>Sort Options</Label>
                <div className="flex gap-1 mt-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => toggleSort("created_at")}>
                    Date {sortKey === "created_at" ? (sortAsc ? "↑" : "↓") : ""}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleSort("lot_number")}>
                    Lot {sortKey === "lot_number" ? (sortAsc ? "↑" : "↓") : ""}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleSort("price")}>
                    Price {sortKey === "price" ? (sortAsc ? "↑" : "↓") : ""}
                  </Button>
                </div>
              </div>
            </div>

            {/* Status Filters Row */}
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div>
                <Label>Print Status</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant={printed === "all" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPrinted("all");
                    }}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={printed === "printed" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPrinted("printed");
                    }}
                  >
                    Printed
                  </Button>
                  <Button
                    size="sm"
                    variant={printed === "unprinted" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPrinted("unprinted");
                    }}
                  >
                    Unprinted
                  </Button>
                </div>
              </div>
              <div>
                <Label>Push Status</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant={pushed === "all" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPushed("all");
                    }}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={pushed === "pushed" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPushed("pushed");
                    }}
                  >
                    Pushed
                  </Button>
                  <Button
                    size="sm"
                    variant={pushed === "unpushed" ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setPushed("unpushed");
                    }}
                  >
                    Unpushed
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={items.length > 0 && selectedIds.size === items.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all items on this page"
                      />
                    </TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>UUID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Printed</TableHead>
                    <TableHead>Pushed</TableHead>
                    <TableHead>Shopify Sync</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    // Show skeleton rows while loading
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-muted-foreground">No items found</p>
                          {(search || lotFilter || selectedLocationGid || printed !== "all" || pushed !== "all" || typeFilter !== "all" || conditionFilter || setFilter || categoryFilter || yearFilter || priceRange.min || priceRange.max) && (
                            <Button variant="outline" size="sm" onClick={clearAllFilters}>
                              Clear filters to see all items
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it) => {
                      const title = buildTitleFromParts(it.year, it.brand_title, it.card_number, it.subject, it.variant);
                      const isGraded = !!it.psa_cert;
                      const isSelected = selectedIds.has(it.id);
                      const isProcessing = processingIds.has(it.id);
                      const canPush = !it.pushed_at && !isProcessing;
                      
                      return (
                      <TableRow key={it.id} className={isSelected ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectItem(it.id, checked as boolean)}
                            aria-label={`Select item ${it.lot_number}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <button
                            onClick={() => {
                              setPage(1);
                              setLotFilter(it.lot_number);
                            }}
                            className="text-primary hover:underline cursor-pointer"
                          >
                            {it.lot_number}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{it.id}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={title || "—"}>
                            {title || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isGraded ? "default" : "secondary"}>
                            {isGraded ? "Graded" : "Raw"}
                          </Badge>
                          {isGraded && it.psa_cert && (
                            <div className="text-xs text-muted-foreground mt-1">
                              PSA {it.psa_cert}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{it.grade || "—"}</TableCell>
                        <TableCell>{it.brand_title || "—"}</TableCell>
                        <TableCell>{it.sku || "—"}</TableCell>
                        <TableCell>{it.price != null ? `$${Number(it.price).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>{it.cost != null ? `$${Number(it.cost).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>{it.quantity != null ? Number(it.quantity) : "—"}</TableCell>
                        <TableCell>
                          {it.printed_at ? <Badge variant="secondary">Printed</Badge> : <Badge>Unprinted</Badge>}
                        </TableCell>
                        <TableCell>
                          {it.pushed_at ? <Badge variant="secondary">Pushed</Badge> : <Badge>Unpushed</Badge>}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            if (!it.removed_from_batch_at) {
                              return <Badge variant="outline">Not in Inventory</Badge>;
                            }
                            
                            const syncStatus = it.shopify_sync_status || 'pending';
                            const lastSynced = it.last_shopify_synced_at;
                            const hasError = it.last_shopify_sync_error;
                            
                            if (syncStatus === 'synced' && !hasError) {
                              return (
                                <div className="space-y-1">
                                  <Badge variant="secondary">Synced</Badge>
                                  {lastSynced && (
                                    <div className="text-xs text-muted-foreground">
                                      {new Date(lastSynced).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              );
                            } else if (syncStatus === 'error' || hasError) {
                              return (
                                <div className="space-y-1">
                                  <Badge variant="destructive">Error</Badge>
                                  {hasError && (
                                    <div className="text-xs text-red-600 max-w-24 truncate" title={hasError}>
                                      {hasError}
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              return <Badge>Pending</Badge>;
                            }
                          })()}
                        </TableCell>
                        <TableCell>{new Date(it.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {canPush && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSinglePush(it.id)}
                                  disabled={!selectedStore || isProcessing}
                                  className="flex items-center gap-1"
                                >
                                  <ShoppingCart className="h-3 w-3" />
                                  {isProcessing ? "Pushing..." : "Push"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleSinglePushAndPrint(it.id)}
                                  disabled={!selectedStore || !isPrintNodeConnected || isProcessing}
                                  className="flex items-center gap-1"
                                >
                                  <ShoppingCart className="h-3 w-3" />
                                  <Printer className="h-3 w-3" />
                                  {isProcessing ? "Processing..." : "Push + Print"}
                                </Button>
                              </>
                            )}
                            {it.removed_from_batch_at && it.sku && it.store_key && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSingleSync(it.id)}
                                disabled={syncingIds.has(it.id)}
                                className="flex items-center gap-1"
                              >
                                <RefreshCw className={`h-3 w-3 ${syncingIds.has(it.id) ? 'animate-spin' : ''}`} />
                                {syncingIds.has(it.id) ? "Syncing..." : "Sync"}
                              </Button>
                            )}
                            {!it.printed_at && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handlePrintLabel(it)}
                                disabled={!isPrintNodeConnected}
                                className="flex items-center gap-1"
                              >
                                <Printer className="h-3 w-3" />
                                Print
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => handleDeleteRow(it)}
                              disabled={deletingId === it.id || bulkDeleting}
                            >
                              {deletingId === it.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages} • {isEstimated ? '~' : ''}{total.toLocaleString()} items
                {fetchStartTime && (
                  <span className="ml-2 text-xs">
                    ({Math.round((Date.now() - fetchStartTime) / 1000)}s)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Shopify Removal Dialog */}
      <ShopifyRemovalDialog
        isOpen={removalDialog.isOpen}
        onClose={() => setRemovalDialog({ isOpen: false, items: [] })}
        onConfirm={removalDialog.onConfirm || (() => {})}
        items={removalDialog.items}
        loading={removalProcessing}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && setDeleteDialog({ isOpen: false, items: [], isBulk: false })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog.isBulk ? `Delete ${deleteDialog.items.length} Items` : 'Delete Item'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.isBulk 
                ? `Are you sure you want to delete ${deleteDialog.items.length} selected items? This action cannot be undone.`
                : `Are you sure you want to delete this item (${deleteDialog.items[0]?.lot_number})? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null || bulkDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDialog.onConfirm) {
                  deleteDialog.onConfirm();
                }
                setDeleteDialog({ isOpen: false, items: [], isBulk: false });
              }}
              disabled={deletingId !== null || bulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingId !== null || bulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
