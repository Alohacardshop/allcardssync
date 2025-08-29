import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ExternalLink, Store, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Navigation } from "@/components/Navigation";
import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";

interface ShopifyStore {
  id?: string;
  name?: string;
  domain?: string;
  plan_name?: string;
  plan_display_name?: string;
  country_code?: string;
  country_name?: string;
}

interface ShopifyLocation {
  id: string;
  name: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  active?: boolean;
}

function useSEO(opts: { title: string; description?: string; }) {
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
  }, [opts.title, opts.description]);
}

export default function ShopifyInspect() {
  useSEO({
    title: "Shopify Store Inspector | Aloha",
    description: "Inspect Shopify store configuration and locations."
  });

  const { selectedStore, availableStores } = useStore();
  const [shopifyStore, setShopifyStore] = useState<ShopifyStore | null>(null);
  const [shopifyLocations, setShopifyLocations] = useState<ShopifyLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShopifyData = async () => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Load store info and locations
      const { data, error } = await supabase.functions.invoke("shopify-config-check", {
        body: { storeKey: selectedStore }
      });

      if (error) throw error;

      if (data?.ok) {
        setShopifyStore(data.shop || null);
        setShopifyLocations(data.locations || []);
      } else {
        throw new Error(data?.error || "Failed to load Shopify data");
      }
    } catch (e: any) {
      console.error("Shopify inspection error:", e);
      setError(e.message || "Failed to load Shopify data");
      toast.error("Failed to load Shopify data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStore) {
      loadShopifyData();
    }
  }, [selectedStore]);

  const selectedStoreInfo = availableStores.find(s => s.key === selectedStore);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Shopify Store Inspector</h1>
              <p className="text-muted-foreground mt-1">Inspect and validate Shopify store configuration.</p>
            </div>
            <Navigation />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <div className="space-y-6">
          {/* Current Store Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Selected Store
                </CardTitle>
                <Button onClick={loadShopifyData} disabled={!selectedStore || loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedStore ? (
                <p className="text-muted-foreground">Please select a store from the navigation to inspect.</p>
              ) : (
                <div className="space-y-2">
                  <div><strong>Store Key:</strong> {selectedStore}</div>
                  <div><strong>Store Name:</strong> {selectedStoreInfo?.name || 'N/A'}</div>
                  <div><strong>Vendor:</strong> {selectedStoreInfo?.vendor || 'N/A'}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="text-red-800">
                  <strong>Error:</strong> {error}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shopify Store Details */}
          {shopifyStore && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  Shopify Store Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><strong>Store Name:</strong> {shopifyStore.name || 'N/A'}</div>
                  <div><strong>Domain:</strong> {shopifyStore.domain || 'N/A'}</div>
                  <div><strong>Plan:</strong> {shopifyStore.plan_display_name || shopifyStore.plan_name || 'N/A'}</div>
                  <div><strong>Country:</strong> {shopifyStore.country_name || shopifyStore.country_code || 'N/A'}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shopify Locations */}
          {shopifyLocations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Shopify Locations ({shopifyLocations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shopifyLocations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell className="font-medium">{location.name}</TableCell>
                        <TableCell>
                          {[
                            location.address1,
                            location.city,
                            location.province,
                            location.country,
                            location.zip
                          ].filter(Boolean).join(', ') || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={location.active ? "default" : "secondary"}>
                            {location.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                <span>Loading Shopify data...</span>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}