import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Drawer, 
  DrawerContent, 
  DrawerDescription, 
  DrawerFooter, 
  DrawerHeader, 
  DrawerTitle 
} from '@/components/ui/drawer';
import { ExternalLink, Link as LinkIcon, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ShopifyInspectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: string;
  intakeItemId: string;
  storeKey: string;
  storeSlug?: string;
  targetLocationGid?: string;
}

interface InspectResult {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  status: 'active' | 'draft';
  published: boolean;
  inventory: Array<{
    locationGid: string;
    locationId: string;
    locationName: string;
    available: number;
  }>;
}

export function ShopifyInspectDrawer({
  open,
  onOpenChange,
  sku,
  intakeItemId,
  storeKey,
  storeSlug = 'aloha-card-shop',
  targetLocationGid
}: ShopifyInspectDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InspectResult[]>([]);
  const [processingActions, setProcessingActions] = useState<Set<string>>(new Set());

  const fetchInspectData = async () => {
    if (!sku || !storeKey) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-inspect', {
        body: { storeKey, sku }
      });

      if (error) throw error;
      setResults(data?.results || []);
    } catch (error: any) {
      console.error('Inspect failed:', error);
      toast.error('Failed to inspect SKU in Shopify');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchInspectData();
    }
  }, [open, sku, storeKey]);

  const handleAction = async (actionKey: string, action: () => Promise<void>) => {
    setProcessingActions(prev => new Set(prev.add(actionKey)));
    try {
      await action();
    } finally {
      setProcessingActions(prev => {
        const next = new Set(prev);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const attachVariant = async (result: InspectResult) => {
    await handleAction(`attach-${result.variantId}`, async () => {
      const { error } = await supabase.functions.invoke('shopify-attach-variant', {
        body: {
          intakeItemId,
          productId: result.productId,
          variantId: result.variantId,
          inventoryItemId: result.inventoryItemId
        }
      });

      if (error) throw error;
      toast.success('Variant attached successfully');
    });
  };

  const publishProduct = async (result: InspectResult) => {
    await handleAction(`publish-${result.productId}`, async () => {
      const { error } = await supabase.functions.invoke('shopify-publish-product', {
        body: { storeKey, productId: result.productId }
      });

      if (error) throw error;
      toast.success('Product published successfully');
      await fetchInspectData(); // Refresh to show updated status
    });
  };

  const setStockAtTarget = async () => {
    if (!targetLocationGid) {
      toast.error('No target location selected');
      return;
    }

    await handleAction('set-stock', async () => {
      const { error } = await supabase.functions.invoke('shopify-sync-inventory', {
        body: {
          storeKey,
          sku,
          locationGid: targetLocationGid
        }
      });

      if (error) throw error;
      toast.success('Stock updated at target location');
      await fetchInspectData(); // Refresh to show updated inventory
    });
  };

  const deleteDuplicates = async () => {
    await handleAction('delete-duplicates', async () => {
      const { data, error } = await supabase.functions.invoke('shopify-delete-duplicates', {
        body: { storeKey, sku }
      });

      if (error) throw error;
      
      const deletedCount = data?.deletedVariantIds?.length || 0;
      toast.success(`Deleted ${deletedCount} duplicate variant${deletedCount !== 1 ? 's' : ''}`);
      await fetchInspectData(); // Refresh to show updated results
    });
  };

  const productUrl = (productId: string) => 
    `https://admin.shopify.com/store/${storeSlug}/products/${productId}`;
  
  const variantUrl = (variantId: string) => 
    `https://admin.shopify.com/store/${storeSlug}/variants/${variantId}`;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Shopify Inspect: {sku}</DrawerTitle>
          <DrawerDescription>
            View all Shopify variants for this SKU and take actions
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading Shopify data...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No variants found in Shopify for SKU: {sku}
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result, index) => {
                const targetLocation = result.inventory.find(
                  inv => inv.locationGid === targetLocationGid
                );

                return (
                  <Card key={result.variantId} className="w-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{result.title}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant={result.status === 'active' ? 'default' : 'secondary'}>
                              {result.status}
                            </Badge>
                            <Badge variant={result.published ? 'default' : 'destructive'}>
                              {result.published ? 'Published' : 'Not Published'}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Product: {result.productId}
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Variant ID: {result.variantId}</div>
                        <div>Inventory Item ID: {result.inventoryItemId}</div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Inventory Grid */}
                      <div>
                        <h4 className="font-medium mb-2">Inventory by Location</h4>
                        <div className="grid gap-2 text-sm">
                          {result.inventory.map((inv) => (
                            <div
                              key={inv.locationGid}
                              className={cn(
                                "flex justify-between items-center p-2 rounded border",
                                inv.locationGid === targetLocationGid && "bg-primary/10 border-primary"
                              )}
                            >
                              <span className="font-medium">{inv.locationName}</span>
                              <Badge variant="outline">{inv.available} available</Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={productUrl(result.productId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open Product
                          </a>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={variantUrl(result.variantId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open Variant
                          </a>
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => attachVariant(result)}
                          disabled={processingActions.has(`attach-${result.variantId}`)}
                        >
                          {processingActions.has(`attach-${result.variantId}`) ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <LinkIcon className="h-3 w-3 mr-1" />
                          )}
                          Attach to this variant
                        </Button>

                        {result.status === 'draft' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => publishProduct(result)}
                            disabled={processingActions.has(`publish-${result.productId}`)}
                          >
                            {processingActions.has(`publish-${result.productId}`) ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Upload className="h-3 w-3 mr-1" />
                            )}
                            Publish product
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <DrawerFooter>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="outline"
              onClick={fetchInspectData}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>

            {targetLocationGid && (
              <Button
                variant="secondary"
                onClick={setStockAtTarget}
                disabled={processingActions.has('set-stock')}
              >
                {processingActions.has('set-stock') ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Set stock at target
              </Button>
            )}

            {results.length > 1 && (
              <Button
                variant="destructive"
                onClick={deleteDuplicates}
                disabled={processingActions.has('delete-duplicates')}
              >
                {processingActions.has('delete-duplicates') ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete duplicates
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}