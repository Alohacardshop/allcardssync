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
import { RefreshCw, AlertTriangle, ShoppingCart, Printer } from "lucide-react";
import { usePrintNode } from "@/hooks/usePrintNode";
import { generateLabelTSPL } from "@/lib/labelTemplates";

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
  const [search, setSearch] = useState("");
  const [printed, setPrinted] = useState<"all" | "printed" | "unprinted">("all");
  const [pushed, setPushed] = useState<"all" | "pushed" | "unpushed">("all");
  const [lotFilter, setLotFilter] = useState("");
  const [sortKey, setSortKey] = useState<keyof ItemRow>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  
  // New filters
  const [typeFilter, setTypeFilter] = useState<"all" | "graded" | "raw">("all");
  const [conditionFilter, setConditionFilter] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });

  // Diagnostic state
  const [diagnostics, setDiagnostics] = useState<{
    user: any;
    roles: string[];
    locations: string[];
    itemCount: number;
  } | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // Fetch diagnostics on mount
  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const roles: string[] = [];
        if (user) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);
          roles.push(...(roleData?.map(r => r.role) || []));
        }

        const { data: locationData } = await supabase
          .from('user_shopify_assignments')
          .select('location_gid')
          .eq('user_id', user?.id || '');

        const { count: itemCount } = await supabase
          .from('intake_items')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null);

        setDiagnostics({
          user,
          roles,
          locations: locationData?.map(l => l.location_gid) || [],
          itemCount: itemCount || 0
        });
      } catch (err) {
        console.error('Diagnostics error:', err);
      }
    };

    fetchDiagnostics();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    
    const fetchData = async () => {
      if (isCancelled) return;
      
      setLoading(true);
      setError(null);
      
      try {
        console.log('Loading intake items from DB...');
        
        let query = supabase
          .from("intake_items")
          .select("*", { count: "exact" })
          .order(sortKey as string, { ascending: sortAsc });

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

        // Exclude soft-deleted records
        query = query.is("deleted_at", null);

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, error, count } = await query.range(from, to);
        
        if (error) {
          console.error('Inventory fetch error:', error);
          throw new Error(`Database error: ${error.message}`);
        }
        
        if (!isCancelled) {
          setItems((data as ItemRow[]) || []);
          setTotal(count || 0);
          console.log(`Loaded ${(data || []).length} items out of ${count || 0} total`);
        }
        
      } catch (e: any) {
        if (!isCancelled) {
          console.error('Fetch error:', e);
          setError(e.message || 'Failed to load inventory');
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(fetchData, 100); // Debounce rapid changes
    
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [page, search, printed, pushed, lotFilter, sortKey, sortAsc, typeFilter, conditionFilter, setFilter, categoryFilter, yearFilter, priceRange, selectedLocationGid]);

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
      
      // Refresh the current page data
      const fetchData = async () => {
        // Reuse the existing fetch logic
        setLoading(true);
        try {
          let query = supabase
            .from("intake_items")
            .select("*", { count: "exact" })
            .order(sortKey as string, { ascending: sortAsc });

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

          query = query.is("deleted_at", null);

          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await query.range(from, to);

          if (error) throw error;

          setItems((data as ItemRow[]) || []);
          setTotal(count || 0);
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
    }
  };

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
                  <span className="text-sm text-muted-foreground">
                    {items.length} of {total} items
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StoreSelector />
                {error && (
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
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
                    onClick={handleBulkPushAndPrint}
                    disabled={!selectedStore || !isPrintNodeConnected || processingIds.size > 0}
                    className="flex items-center gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <Printer className="h-4 w-4" />
                    Push + Print ({selectedIds.size})
                  </Button>
                </div>
              </div>
            )}
            
            {/* Diagnostics Panel */}
            {diagnostics && (process.env.NODE_ENV === 'development' || diagnostics.itemCount === 0) && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <div className="text-sm space-y-1">
                  <div><strong>Auth:</strong> {diagnostics.user ? `✅ ${diagnostics.user.email}` : '❌ Not logged in'}</div>
                  <div><strong>Roles:</strong> {diagnostics.roles.length > 0 ? diagnostics.roles.join(', ') : 'None'}</div>
                  <div><strong>Locations:</strong> {diagnostics.locations.length > 0 ? `${diagnostics.locations.length} assigned` : 'None'}</div>
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
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-8">
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
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteRow(it)}>
                              Delete
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
                Page {page} of {totalPages} • {total.toLocaleString()} items
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
    </div>
  );
}
