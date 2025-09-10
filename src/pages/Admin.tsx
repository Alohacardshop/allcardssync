import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';
import { Settings, Database, ShoppingCart, Search, ExternalLink, RotateCcw, Loader2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { ShopifyConfig } from '@/components/admin/ShopifyConfig';
import TCGDatabaseSettings from '@/components/admin/TCGDatabaseSettings';
import { SystemHealthCard } from '@/components/admin/SystemHealthCard';
import { SystemLogsViewer } from '@/components/admin/SystemLogsViewer';
import { TCGHealthCheck } from '@/components/admin/TCGHealthCheck';
import { PricingJobsMonitor } from '@/components/admin/PricingJobsMonitor';
import { UserAssignmentManager } from '@/components/UserAssignmentManager';
import { RawIntakeSettings } from '@/components/admin/RawIntakeSettings';
import CatalogTab from '@/components/admin/CatalogTab';
import { InventorySyncSettings } from '@/components/admin/InventorySyncSettings';
import { ShopifyTagImport } from '@/components/admin/ShopifyTagImport';
import { PSAApiSettings } from '@/components/admin/PSAApiSettings';
import { PSAScrapePingCard } from '@/components/admin/PSAScrapePingCard';
import { CGCScrapePingCard } from '@/components/admin/CGCScrapePingCard';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [skuInspectorSku, setSkuInspectorSku] = useState('');
  const [skuInspectorStoreKey, setSkuInspectorStoreKey] = useState('');
  const [skuInspectorResult, setSkuInspectorResult] = useState<any>(null);
  const [skuInspectorLoading, setSkuInspectorLoading] = useState(false);

  // Get tab from URL parameters on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const handleInspectSku = async () => {
    if (!skuInspectorSku.trim() || !skuInspectorStoreKey.trim()) {
      toast.error('Both SKU and Store Key are required');
      return;
    }

    setSkuInspectorLoading(true);
    setSkuInspectorResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('shopify-inspect-sku', {
        body: { 
          storeKey: skuInspectorStoreKey.trim(), 
          sku: skuInspectorSku.trim() 
        }
      });

      if (error) throw error;
      setSkuInspectorResult(data);
    } catch (error) {
      console.error('SKU inspection failed:', error);
      setSkuInspectorResult({
        ok: false,
        code: 'CLIENT_ERROR',
        message: error.message || 'Unknown error'
      });
    } finally {
      setSkuInspectorLoading(false);
    }
  };

  const handleResyncSku = async () => {
    if (!skuInspectorSku.trim() || !skuInspectorStoreKey.trim()) {
      toast.error('Both SKU and Store Key are required');
      return;
    }

    try {
      // First validate
      const { error: validateError } = await supabase.functions.invoke('shopify-sync-inventory', {
        body: {
          storeKey: skuInspectorStoreKey.trim(),
          sku: skuInspectorSku.trim(),
          validateOnly: true
        }
      });

      if (validateError) {
        toast.error(`Validation failed: ${validateError.message}`);
        return;
      }

      // Then sync
      const { error: syncError } = await supabase.functions.invoke('shopify-sync-inventory', {
        body: {
          storeKey: skuInspectorStoreKey.trim(),
          sku: skuInspectorSku.trim(),
          validateOnly: false
        }
      });

      if (syncError) throw syncError;

      toast.success('Re-sync completed successfully');
      // Re-inspect to show updated results
      handleInspectSku();
    } catch (error) {
      console.error('Re-sync failed:', error);
      toast.error('Re-sync failed: ' + error.message);
    }
  };

  return (
    <>
      {/* Navigation Header */}
      <div className="bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-lg font-semibold">Admin Dashboard</h1>
            </div>
            <Navigation showMobileMenu={true} />
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="shopify" className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Shopify
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database
            </TabsTrigger>
            <TabsTrigger value="debug" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Debug
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SystemHealthCard />
              <TCGHealthCheck />
              <PricingJobsMonitor />
              <PSAScrapePingCard />
              <CGCScrapePingCard />
            </div>
          </TabsContent>

          <TabsContent value="shopify" className="space-y-4">
            <ShopifyConfig />
            <InventorySyncSettings />
            <ShopifyTagImport />
          </TabsContent>

          <TabsContent value="database" className="space-y-4">
            <TCGDatabaseSettings />
            <RawIntakeSettings />
            <CatalogTab />
            <PSAApiSettings />
          </TabsContent>

          <TabsContent value="debug" className="space-y-4">
            {/* SKU Inspector Tool */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Resolve SKU in Shopify
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      placeholder="Enter SKU to inspect"
                      value={skuInspectorSku}
                      onChange={(e) => setSkuInspectorSku(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInspectSku()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="storeKey">Store Key</Label>
                    <Input
                      id="storeKey"
                      placeholder="e.g. hawaii, las_vegas"
                      value={skuInspectorStoreKey}
                      onChange={(e) => setSkuInspectorStoreKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInspectSku()}
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleInspectSku}
                    disabled={skuInspectorLoading || !skuInspectorSku.trim() || !skuInspectorStoreKey.trim()}
                    className="flex items-center gap-2"
                  >
                    {skuInspectorLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Inspect SKU
                  </Button>
                  
                  {skuInspectorResult && (
                    <Button
                      onClick={handleResyncSku}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Re-sync
                    </Button>
                  )}
                </div>

                {skuInspectorResult && (
                  <div className="space-y-4 mt-4">
                    {skuInspectorResult.ok ? (
                      <>
                        <div className="p-3 bg-muted rounded-lg">
                          <h4 className="font-medium text-green-800">✅ Search Results</h4>
                          <p className="text-sm text-muted-foreground">
                            Found {skuInspectorResult.variants.length} variant{skuInspectorResult.variants.length !== 1 ? 's' : ''} for SKU "{skuInspectorSku}"
                          </p>
                          {skuInspectorResult.diagnostics && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Domain: {skuInspectorResult.diagnostics.domainUsed} • Duration: {skuInspectorResult.diagnostics.requestDurationMs}ms
                            </p>
                          )}
                        </div>
                        
                        {skuInspectorResult.variants.length === 0 ? (
                          <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                            <p className="text-amber-800 font-medium">⚠️ SKU not found in Shopify</p>
                            <p className="text-sm text-amber-700 mt-1">
                              This SKU does not exist in your Shopify store yet. Use "Re-sync" to create it.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {skuInspectorResult.variants.map((variant: any, i: number) => (
                              <div key={i} className="p-4 border rounded-lg space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div><strong>Product:</strong> {variant.productTitle}</div>
                                  <div><strong>Status:</strong> 
                                    <Badge variant={variant.productStatus === 'ACTIVE' ? 'default' : 'secondary'} className="ml-1">
                                      {variant.productStatus}
                                    </Badge>
                                  </div>
                                  <div><strong>Published:</strong> 
                                    <Badge variant={variant.published ? 'default' : 'secondary'} className="ml-1">
                                      {variant.published ? 'Yes' : 'No'}
                                    </Badge>
                                  </div>
                                  <div><strong>Variant:</strong> {variant.variantTitle}</div>
                                  <div><strong>Product ID:</strong> {variant.productId.replace('gid://shopify/Product/', '')}</div>
                                  <div><strong>Variant ID:</strong> {variant.variantId.replace('gid://shopify/ProductVariant/', '')}</div>
                                  <div><strong>Inventory Item ID:</strong> {variant.inventoryItemId?.replace('gid://shopify/InventoryItem/', '')}</div>
                                </div>
                                
                                {variant.locations && variant.locations.length > 0 && (
                                  <div className="mt-3">
                                    <h5 className="text-sm font-medium mb-2">Inventory by Location:</h5>
                                    <div className="grid gap-2">
                                      {variant.locations.map((location: any, j: number) => (
                                        <div key={j} className="flex justify-between items-center text-sm bg-muted/50 p-2 rounded">
                                          <span>{location.name}</span>
                                          <Badge variant={location.available > 0 ? 'default' : 'secondary'}>
                                            {location.available} available
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex gap-2 mt-3">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`https://${skuInspectorResult.diagnostics?.domainUsed?.replace('.myshopify.com', '')}/admin/products/${variant.productId.replace('gid://shopify/Product/', '')}`, '_blank')}
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    View Product
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`https://${skuInspectorResult.diagnostics?.domainUsed?.replace('.myshopify.com', '')}/admin/variants/${variant.variantId.replace('gid://shopify/ProductVariant/', '')}`, '_blank')}
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    View Variant
                                  </Button>
                                  {skuInspectorResult.variants.length > 1 && (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          const { data, error } = await supabase.functions.invoke('shopify-delete-duplicates', {
                                            body: {
                                              storeKey: skuInspectorStoreKey,
                                              sku: skuInspectorSku,
                                              variants: skuInspectorResult.variants.map((v: any) => ({
                                                productId: v.productId,
                                                variantId: v.variantId
                                              }))
                                            }
                                          });
                                          
                                          if (error) throw error;
                                          
                                          if (data.ok) {
                                            toast.success(`Deleted ${data.results.deleted} duplicates, unpublished ${data.results.unpublished}`);
                                            // Re-inspect to show updated results
                                            handleInspectSku();
                                          } else {
                                            throw new Error(data.message);
                                          }
                                        } catch (error) {
                                          console.error('Delete duplicates failed:', error);
                                          toast.error('Failed to delete duplicates: ' + error.message);
                                        }
                                      }}
                                    >
                                      Delete Duplicates
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                        <p className="text-red-800 font-medium">❌ {skuInspectorResult.message}</p>
                        <p className="text-sm text-red-700 mt-1">Error Code: {skuInspectorResult.code}</p>
                        
                        {(skuInspectorResult.code === 'MISSING_DOMAIN' || skuInspectorResult.code === 'MISSING_TOKEN') && (
                          <div className="mt-3">
                            <Button
                              onClick={() => setActiveTab('shopify')}
                              variant="outline"
                              size="sm"
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Go to Shopify Configuration
                            </Button>
                          </div>
                        )}
                        
                        {skuInspectorResult.diagnostics && (
                          <details className="mt-3">
                            <summary className="text-xs cursor-pointer text-red-700 hover:text-red-900">
                              Show diagnostic details
                            </summary>
                            <pre className="text-xs mt-2 p-2 bg-red-100 rounded overflow-auto">
                              {JSON.stringify(skuInspectorResult.diagnostics, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <UserAssignmentManager />
          </TabsContent>

          <TabsContent value="logs">
            <SystemLogsViewer />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Admin;