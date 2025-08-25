import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { StoreSelector } from "@/components/StoreSelector";
import { buildTitleFromParts } from "@/lib/labelData";
import { AlertTriangle, CheckCircle, Clock, ExternalLink, RefreshCw, Edit3, MapPin, Settings } from "lucide-react";

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

type MappingItem = {
  id: string;
  lot_number: string;
  sku: string | null;
  psa_cert: string | null;
  brand_title: string | null;
  subject: string | null;
  year: string | null;
  card_number: string | null;
  variant: string | null;
  grade: string | null;
  price: number | null;
  quantity: number | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
  pushed_at: string | null;
  created_at: string;
  category: string | null;
};

type ProductGroup = {
  handle: string;
  title: string;
  productId: string | null;
  items: MappingItem[];
  isRawSingle: boolean;
  hasConflicts: boolean;
};

export default function ShopifyMapping() {
  useSEO({ 
    title: "Shopify Product Mapping | Aloha", 
    description: "Manage how inventory items map to Shopify products and variants." 
  });

  const [items, setItems] = useState<MappingItem[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "mapped" | "unmapped" | "conflicts">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<{ groupHandle: string; currentId: string | null } | null>(null);
  const [newProductId, setNewProductId] = useState("");
  const [shopifyLocations, setShopifyLocations] = useState<Array<{ id: string; name: string }>>([]);

  const loadMappingData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("intake_items")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mappingItems: MappingItem[] = (data || []).map(item => ({
        id: item.id,
        lot_number: item.lot_number,
        sku: item.sku,
        psa_cert: item.psa_cert,
        brand_title: item.brand_title,
        subject: item.subject,
        year: item.year,
        card_number: item.card_number,
        variant: item.variant,
        grade: item.grade,
        price: item.price,
        quantity: item.quantity,
        shopify_product_id: item.shopify_product_id,
        shopify_variant_id: item.shopify_variant_id,
        shopify_inventory_item_id: item.shopify_inventory_item_id,
        pushed_at: item.pushed_at,
        created_at: item.created_at,
        category: item.category,
      }));

      setItems(mappingItems);
      
      // Group items for mapping analysis
      const groups = analyzeProductGroups(mappingItems);
      setProductGroups(groups);
      
    } catch (e) {
      console.error(e);
      toast.error("Failed to load mapping data");
    } finally {
      setLoading(false);
    }
  };

  const analyzeProductGroups = (items: MappingItem[]): ProductGroup[] => {
    const groups = new Map<string, ProductGroup>();

    items.forEach(item => {
      // Determine if this is a raw single
      const isRawSingle = item.sku && /^\d+/.test(item.sku) && !item.grade;
      
      let handle: string;
      let title: string;
      
      if (isRawSingle && item.sku) {
        // For raw singles, group by product ID (first part of SKU)
        const productId = item.sku.split(/[-_\s]+/)[0];
        handle = `product-${productId}`;
        title = item.brand_title || item.subject || `Product ${productId}`;
      } else {
        // For graded cards, each item gets its own product
        title = buildTitleFromParts(item.year, item.brand_title, item.card_number, item.subject, item.variant);
        handle = item.sku || item.psa_cert || item.lot_number || "";
      }

      if (!groups.has(handle)) {
        groups.set(handle, {
          handle,
          title,
          productId: null,
          items: [],
          isRawSingle,
          hasConflicts: false,
        });
      }

      const group = groups.get(handle)!;
      group.items.push(item);

      // Set product ID if any item has one
      if (item.shopify_product_id && !group.productId) {
        group.productId = item.shopify_product_id;
      }

      // Check for conflicts (multiple product IDs for same handle)
      if (item.shopify_product_id && group.productId && item.shopify_product_id !== group.productId) {
        group.hasConflicts = true;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      // Sort conflicts first, then by title
      if (a.hasConflicts && !b.hasConflicts) return -1;
      if (!a.hasConflicts && b.hasConflicts) return 1;
      return a.title.localeCompare(b.title);
    });
  };

  const handleBulkPush = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    
    setProcessingIds(prev => new Set([...prev, ...itemIds]));
    
    try {
      const promises = itemIds.map(async (itemId) => {
        const { error } = await supabase.functions.invoke("shopify-import", { 
          body: { itemId } 
        });
        if (error) throw error;
      });

      await Promise.all(promises);
      toast.success(`Successfully pushed ${itemIds.length} items to Shopify`);
      loadMappingData();
    } catch (e) {
      console.error(e);
      toast.error("Some items failed to push to Shopify");
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        itemIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  const handleGroupPush = async (group: ProductGroup) => {
    const unmappedItems = group.items.filter(item => !item.shopify_product_id);
    if (unmappedItems.length === 0) {
      toast.info("All items in this group are already mapped");
      return;
    }
    
    await handleBulkPush(unmappedItems.map(item => item.id));
  };

  const clearMapping = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("intake_items")
        .update({
          shopify_product_id: null,
          shopify_variant_id: null,
          shopify_inventory_item_id: null,
          pushed_at: null,
        })
        .eq("id", itemId);

      if (error) throw error;
      toast.success("Mapping cleared");
      loadMappingData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear mapping");
    }
  };

  const setManualProductId = async (groupHandle: string, productId: string) => {
    try {
      const group = productGroups.find(g => g.handle === groupHandle);
      if (!group) return;

      const { error } = await supabase
        .from("intake_items")
        .update({ shopify_product_id: productId || null })
        .in("id", group.items.map(item => item.id));

      if (error) throw error;
      toast.success("Product ID updated");
      loadMappingData();
      setEditingProductId(null);
      setNewProductId("");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update product ID");
    }
  };

  const resolveConflict = async (groupHandle: string, keepProductId: string) => {
    try {
      const group = productGroups.find(g => g.handle === groupHandle);
      if (!group) return;

      const { error } = await supabase
        .from("intake_items")
        .update({ shopify_product_id: keepProductId })
        .in("id", group.items.map(item => item.id));

      if (error) throw error;
      toast.success("Conflict resolved");
      loadMappingData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to resolve conflict");
    }
  };

  const loadShopifyLocations = async () => {
    if (!selectedStore) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey: selectedStore }
      });
      
      if (error) throw error;
      setShopifyLocations(data?.locations || []);
    } catch (e) {
      console.error(e);
      setShopifyLocations([]);
    }
  };

  useEffect(() => {
    loadMappingData();
  }, []);

  useEffect(() => {
    loadShopifyLocations();
  }, [selectedStore]);

  const filteredGroups = productGroups.filter(group => {
    // Apply filter
    if (filter === "mapped" && !group.productId) return false;
    if (filter === "unmapped" && group.productId) return false;
    if (filter === "conflicts" && !group.hasConflicts) return false;
    
    // Apply search
    if (searchTerm && !group.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !group.handle.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const stats = {
    total: productGroups.length,
    mapped: productGroups.filter(g => g.productId).length,
    unmapped: productGroups.filter(g => !g.productId).length,
    conflicts: productGroups.filter(g => g.hasConflicts).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Shopify Product Mapping</h1>
              <p className="text-muted-foreground mt-1">Map intake items to Shopify products and manage inventory sync.</p>
            </div>
            <Navigation />
          </div>
          
          {/* Store Selector */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <Label htmlFor="store-select">Target Store:</Label>
            </div>
            <StoreSelector 
              selectedStore={selectedStore} 
              onStoreChange={setSelectedStore} 
            />
            {shopifyLocations.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{shopifyLocations.length} location{shopifyLocations.length !== 1 ? 's' : ''} available</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Products</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.mapped}</div>
              <div className="text-sm text-muted-foreground">Mapped</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{stats.unmapped}</div>
              <div className="text-sm text-muted-foreground">Unmapped</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{stats.conflicts}</div>
              <div className="text-sm text-muted-foreground">Conflicts</div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-aloha">
          <CardHeader>
            <CardTitle>Product Groups</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Products</Label>
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title or handle..."
                />
              </div>
              <div>
                <Label htmlFor="filter">Filter</Label>
                <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="mapped">Mapped Only</SelectItem>
                    <SelectItem value="unmapped">Unmapped Only</SelectItem>
                    <SelectItem value="conflicts">Conflicts Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading mapping data...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No products match your filters</div>
              ) : (
                filteredGroups.map((group) => (
                  <Card key={group.handle} className={`${group.hasConflicts ? 'border-red-200 bg-red-50' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{group.title}</CardTitle>
                            {group.isRawSingle && <Badge variant="secondary">Raw Single</Badge>}
                            {group.hasConflicts && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Conflict
                              </Badge>
                            )}
                            {group.productId && !group.hasConflicts && (
                              <Badge variant="default" className="flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Mapped
                              </Badge>
                            )}
                            {!group.productId && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Unmapped
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Handle: <code className="bg-muted px-1 rounded">{group.handle}</code>
                            {group.productId && (
                              <>
                                {" • "}Shopify ID: <code className="bg-muted px-1 rounded">{group.productId}</code>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {group.hasConflicts && (
                            <div className="flex gap-1">
                              {Array.from(new Set(group.items.map(i => i.shopify_product_id).filter(Boolean))).map(pid => (
                                <Button
                                  key={pid}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resolveConflict(group.handle, pid!)}
                                  className="text-xs"
                                >
                                  Keep {pid?.slice(-8)}
                                </Button>
                              ))}
                            </div>
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => {
                                  setEditingProductId({ groupHandle: group.handle, currentId: group.productId });
                                  setNewProductId(group.productId || "");
                                }}
                              >
                                <Edit3 className="w-4 h-4 mr-1" />
                                Set ID
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Set Shopify Product ID</DialogTitle>
                                <DialogDescription>
                                  Manually set the Shopify product ID for "{group.title}"
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="product-id">Product ID</Label>
                                  <Input
                                    id="product-id"
                                    value={newProductId}
                                    onChange={(e) => setNewProductId(e.target.value)}
                                    placeholder="e.g., gid://shopify/Product/123456789"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setEditingProductId(null);
                                      setNewProductId("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => setManualProductId(group.handle, newProductId)}
                                  >
                                    Update
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          {group.productId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`https://admin.shopify.com/store/${selectedStore || 'your-store'}/products/${group.productId}`, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View in Shopify
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleGroupPush(group)}
                            disabled={processingIds.has(group.items[0]?.id) || !selectedStore}
                          >
                            {processingIds.has(group.items[0]?.id) ? "Processing..." : "Push to Shopify"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Lot #</TableHead>
                              <TableHead>SKU/Cert</TableHead>
                              <TableHead>Condition/Grade</TableHead>
                              <TableHead>Price</TableHead>
                              <TableHead>Qty</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-xs">{item.lot_number}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {item.psa_cert || item.sku || "—"}
                                </TableCell>
                                <TableCell>{item.grade || item.variant || "—"}</TableCell>
                                <TableCell>{item.price ? `$${Number(item.price).toLocaleString()}` : "—"}</TableCell>
                                <TableCell>{item.quantity || 0}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    {item.shopify_variant_id ? (
                                      <Badge variant="default">Mapped</Badge>
                                    ) : (
                                      <Badge variant="outline">Unmapped</Badge>
                                    )}
                                    {item.pushed_at && (
                                      <div className="text-xs text-muted-foreground">
                                        Pushed {new Date(item.pushed_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {!item.shopify_variant_id ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkPush([item.id])}
                                        disabled={processingIds.has(item.id) || !selectedStore}
                                        title={!selectedStore ? "Select a store first" : "Push to Shopify"}
                                      >
                                        Push
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => clearMapping(item.id)}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}