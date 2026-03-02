import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, ChevronDown, ChevronRight, CheckCircle, XCircle, AlertCircle, RefreshCw, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import type { InventoryItem, ShopifySyncStep, ShopifyLocation } from '@/types/inventory';
import { logger } from '@/lib/logger';
import { StockByLocationSection } from '@/components/inventory/StockByLocationSection';
import { useLocationNames } from '@/hooks/useLocationNames';
import { QuantityChangeHistory } from '@/components/QuantityChangeHistory';
import { EditableField } from '@/features/inventory/components/inspector/EditableField';
import { InlineQuantityEditor } from '@/components/inventory-card/InlineQuantityEditor';
import { useQueryClient } from '@tanstack/react-query';
import { formatGrade } from '@/lib/labelData';

interface ShopifySyncDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: InventoryItem;
  selectedStoreKey?: string;
  selectedLocationGid?: string;
  onRefresh?: () => void;
}

export function ShopifySyncDetailsDialog({ open, onOpenChange, row, selectedStoreKey, selectedLocationGid, onRefresh }: ShopifySyncDetailsDialogProps) {
  const [locationName, setLocationName] = useState<string>('');
  const [expandedJson, setExpandedJson] = useState(false);
  const [relinkingGraded, setRelinkingGraded] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch location names for stock by location section
  const { data: locationsMap } = useLocationNames(row?.store_key || selectedStoreKey || null);

  useEffect(() => {
    if (open && row?.last_shopify_store_key && row?.last_shopify_location_gid) {
      // Fetch location name
      const fetchLocationName = async () => {
        try {
          const { data } = await supabase.functions.invoke('shopify-locations', {
            body: { storeKey: row.last_shopify_store_key }
          });
          
          if (data?.locations) {
            const location = data.locations.find((loc: any) => 
              loc.gid === row.last_shopify_location_gid
            );
            if (location) {
              setLocationName(location.name);
            }
          }
        } catch (error) {
          logger.error('Failed to fetch location name', error instanceof Error ? error : new Error(String(error)), { locationGid: row.last_shopify_location_gid }, 'shopify-sync-details');
        }
      };
      
      fetchLocationName();
    }
  }, [open, row]);

  // Always show dialog if row exists, even without sync snapshot

  const snapshot = row.shopify_sync_snapshot || {};
  const isSuccess = row.shopify_sync_status === 'success';
  
  const handleFieldSave = useCallback(async (field: string, value: string | number) => {
    setIsSaving(true);
    try {
      // Update local DB
      const dbUpdate: Record<string, unknown> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };
      const { error: dbError } = await supabase
        .from('intake_items')
        .update(dbUpdate)
        .eq('id', row.id);
      if (dbError) throw new Error(dbError.message);

      const syncResults: string[] = ['Saved'];

      // Sync to Shopify if synced
      if (row.shopify_product_id && row.shopify_sync_status === 'synced' && (row.store_key || selectedStoreKey)) {
        try {
          const shopifyUpdates: Record<string, unknown> = {};
          if (field === 'price') {
            shopifyUpdates.price = value;
          } else if (['subject', 'brand_title', 'card_number', 'year'].includes(field)) {
            // Rebuild title
            const parts: string[] = [];
            const yr = field === 'year' ? String(value) : (row.year || '');
            const brand = field === 'brand_title' ? String(value) : (row.brand_title || '');
            const subj = field === 'subject' ? String(value) : (row.subject || '');
            const cardNum = field === 'card_number' ? String(value) : (row.card_number || '');
            if (yr) parts.push(yr);
            if (brand) parts.push(brand);
            if (subj) parts.push(subj);
            if (cardNum) parts.push(`#${cardNum}`);
            if (row.grade && (row.psa_cert || row.grading_company)) {
              parts.push(`${row.grading_company || 'PSA'} ${formatGrade(row.grade)}`);
            }
            shopifyUpdates.title = parts.join(' ') || 'Unknown Item';
          }

          if (Object.keys(shopifyUpdates).length > 0) {
            const { data, error } = await supabase.functions.invoke('shopify-update-product', {
              body: { itemId: row.id, storeKey: row.store_key || selectedStoreKey, updates: shopifyUpdates },
            });
            syncResults.push(error || !data?.synced ? '→ Shopify ✗' : '→ Shopify ✓');
          }
        } catch { syncResults.push('→ Shopify ✗'); }
      }

      // Sync price to eBay if listed
      if (field === 'price' && row.ebay_listing_id && row.sku && (row.store_key || selectedStoreKey)) {
        try {
          const { data, error } = await supabase.functions.invoke('ebay-update-inventory', {
            body: { sku: row.sku, quantity: row.quantity, store_key: row.store_key || selectedStoreKey, price: value },
          });
          syncResults.push(error || !data?.success ? '→ eBay ✗' : '→ eBay ✓');
        } catch { syncResults.push('→ eBay ✗'); }
      }

      const hasFailure = syncResults.some(s => s.includes('✗'));
      if (hasFailure) {
        sonnerToast.warning(syncResults.join(' '));
      } else {
        sonnerToast.success(syncResults.join(' '));
      }
      
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-item-detail'] });
      if (onRefresh) onRefresh();
    } catch (e: any) {
      sonnerToast.error(`Failed to save: ${e?.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [row, selectedStoreKey, queryClient, onRefresh]);

  const getStepIcon = (step: ShopifySyncStep) => {
    if (step.ok) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (step.ok === false) return <XCircle className="w-4 h-4 text-red-500" />;
    return <AlertCircle className="w-4 h-4 text-yellow-500" />;
  };

  const getStepStatus = (step: ShopifySyncStep) => {
    if (step.status) return step.status;
    return step.ok ? 'OK' : 'FAIL';
  };

  const handleRelinkGraded = async () => {
    if (!row || !selectedStoreKey || !selectedLocationGid) {
      toast({ title: 'Error', description: 'Missing store or location selection', variant: 'destructive' });
      return;
    }

    const psaCert = row.psa_cert || row.barcode || row.sku;
    if (!psaCert) {
      toast({ title: 'Error', description: 'No PSA cert number available for relinking', variant: 'destructive' });
      return;
    }

    setRelinkingGraded(true);
    try {
      const { error, data } = await supabase.functions.invoke('admin-relink-graded-by-cert', {
        body: {
          storeKey: selectedStoreKey,
          locationGid: selectedLocationGid,
          itemId: row.id,
          psaCert,
          quantity: row.quantity || 1
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({ 
        title: 'Success', 
        description: `Relinked graded item to PSA cert ${data.enforcedBarcode}. Decision: ${data.decision}`
      });
      
      if (onRefresh) onRefresh();
    } catch (e: any) {
      logger.error('Relink failed', e instanceof Error ? e : new Error(String(e)), { itemId: row.id }, 'shopify-sync-details');
      toast({ 
        title: 'Relink Failed', 
        description: e?.message || 'Failed to relink graded item',
        variant: 'destructive'
      });
    } finally {
      setRelinkingGraded(false);
    }
  };

  const handleResync = async () => {
    if (!selectedStoreKey || !selectedLocationGid) {
      toast({ title: 'Error', description: 'Missing store or location selection', variant: 'destructive' });
      return;
    }

    setResyncing(true);
    try {
      const isGraded = row.type === 'Graded' || (row.grade && row.grade !== 'Raw' && row.grade !== 'Ungraded');
      const endpoint = isGraded ? 'v2-shopify-send-graded' : 'v2-shopify-send-raw';

      const payload: any = {
        storeKey: selectedStoreKey,
        locationGid: selectedLocationGid,
        item: {
          id: row.id,
          sku: row.sku,
          title: row.subject || row.brand_title,
          price: row.price,
          quantity: row.quantity,
          barcode: row.psa_cert || row.sku,
          cost: row.cost,
        }
      };

      // Add graded-specific fields
      if (isGraded) {
        payload.item.psa_cert = row.psa_cert;
        payload.item.grade = row.grade;
        payload.item.year = row.year;
        payload.item.brand_title = row.brand_title;
        payload.item.subject = row.subject;
        payload.item.card_number = row.card_number;
        payload.item.variant = row.variant;
        payload.item.category_tag = row.category;
        payload.item.image_url = row.image_urls?.[0] || row.catalog_snapshot?.image_url;
      } else {
        payload.item.brand_title = row.brand_title;
        payload.item.subject = row.subject;
        payload.item.card_number = row.card_number;
        payload.item.condition = row.condition;
        payload.item.image_url = row.image_urls?.[0] || row.catalog_snapshot?.image_url;
      }

      const { error, data } = await supabase.functions.invoke(endpoint, { body: payload });

      if (error) {
        throw new Error(error.message);
      }

      toast({ 
        title: 'Success', 
        description: `Item resynced to Shopify successfully`
      });
      
      if (onRefresh) onRefresh();
    } catch (e: any) {
      logger.error('Resync failed', e instanceof Error ? e : new Error(String(e)), { itemId: row.id, shopifyProductId: row.shopify_product_id }, 'shopify-sync-details');
      toast({ 
        title: 'Resync Failed', 
        description: e?.message || 'Failed to resync item to Shopify',
        variant: 'destructive'
      });
    } finally {
      setResyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-between w-full">
            <div className="flex items-center gap-2">
              Shopify Sync Details
              <Badge variant={isSuccess ? 'default' : 'destructive'}>
                {row.shopify_sync_status?.toUpperCase() || 'UNKNOWN'}
              </Badge>
            </div>
            {row.shopify_product_id && selectedStoreKey && selectedLocationGid && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResync}
                disabled={resyncing}
                className="flex items-center gap-2"
              >
                {resyncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Resyncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    Resync
                  </>
                )}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Item Information */}
          <div className="border rounded-lg p-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">
              Item Information
              {isSaving && <span className="ml-2 text-xs animate-pulse">Saving…</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* SKU - read only */}
              <div>
                <div className="text-xs font-medium text-muted-foreground">SKU</div>
                <div className="font-mono text-sm">{row.sku}</div>
              </div>
              <EditableField
                label="Year"
                value={row.year || row.catalog_snapshot?.year || ''}
                onSave={(v) => handleFieldSave('year', v)}
              />
              <EditableField
                label="Brand / Title / Game"
                value={row.brand_title || ''}
                onSave={(v) => handleFieldSave('brand_title', v)}
              />
              <EditableField
                label="Subject"
                value={row.subject || ''}
                onSave={(v) => handleFieldSave('subject', v)}
              />
              <EditableField
                label="Category"
                value={row.category || ''}
                onSave={(v) => handleFieldSave('category', v)}
              />
              <EditableField
                label="Variant"
                value={row.variant || row.catalog_snapshot?.varietyPedigree || ''}
                onSave={(v) => handleFieldSave('variant', v)}
              />
              <EditableField
                label="Card Number"
                value={row.card_number || ''}
                onSave={(v) => handleFieldSave('card_number', v)}
              />
              <div>
                <div className="text-xs font-medium text-muted-foreground">Grade</div>
                <div className="text-sm">{row.grade || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Grading Company</div>
                <div className="text-sm">{row.grading_company || 'PSA'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">{row.grading_company || 'PSA'} Certificate</div>
                <div className="text-sm font-mono">{row.psa_cert || row.sku || 'N/A'}</div>
              </div>
              <EditableField
                label="Price"
                value={row.price}
                type="currency"
                onSave={(v) => handleFieldSave('price', v)}
              />
              <div>
                <div className="text-xs font-medium text-muted-foreground">Cost</div>
                <div className="text-sm">{row.cost ? `$${parseFloat(String(row.cost)).toFixed(2)}` : 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Quantity</div>
                <InlineQuantityEditor
                  itemId={row.id}
                  quantity={row.quantity}
                  shopifyProductId={row.shopify_product_id}
                  shopifyInventoryItemId={row.shopify_inventory_item_id}
                />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Type</div>
                <div className="text-sm">{row.type || 'Raw'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Store</div>
                <div className="text-sm">{row.store_key || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Location GID</div>
                <div className="text-sm font-mono text-xs">{row.shopify_location_gid || 'N/A'}</div>
              </div>
            </div>
            
            {/* Image URL Section */}
            {(row.image_urls?.[0] || row.catalog_snapshot?.image_url || row.psa_snapshot?.image_url) && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Image</div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Image URL</div>
                    <div className="text-sm font-mono break-all">
                      {row.image_urls?.[0] || row.catalog_snapshot?.image_url || row.psa_snapshot?.image_url}
                    </div>
                  </div>
                  {(row.image_urls?.[0] || row.catalog_snapshot?.image_url || row.psa_snapshot?.image_url) && (
                    <div className="flex-shrink-0">
                      <img 
                        src={row.image_urls?.[0] || row.catalog_snapshot?.image_url || row.psa_snapshot?.image_url}
                        alt="Card"
                        className="w-20 h-28 object-cover rounded border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sync Status Information */}
          <div className="border rounded-lg p-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">Shopify Sync Status</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Status</div>
                <Badge variant={row.shopify_sync_status === 'synced' ? 'default' : row.shopify_sync_status === 'error' ? 'destructive' : 'outline'}>
                  {row.shopify_sync_status?.toUpperCase() || 'PENDING'}
                </Badge>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Last Synced</div>
                <div className="text-sm">{row.last_shopify_synced_at ? formatDistanceToNow(new Date(row.last_shopify_synced_at), { addSuffix: true }) : 'Never'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Product ID</div>
                <div className="text-sm font-mono">{row.shopify_product_id || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Correlation ID</div>
                <div className="font-mono text-xs">{row.last_shopify_correlation_id || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Stock by Location - from Shopify webhook data */}
          <StockByLocationSection
            inventoryItemId={row.shopify_inventory_item_id}
            locationsMap={locationsMap}
            primaryLocationGid={row.shopify_location_gid || row.last_shopify_location_gid}
          />

          {/* Staff Audit - "Why did this change?" */}
          <QuantityChangeHistory itemId={row.id} sku={row.sku} />

          {snapshot?.graded && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm">Graded Item Sync Details</h4>
                {selectedStoreKey && selectedLocationGid && (row.psa_cert || row.barcode || row.sku) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRelinkGraded}
                    disabled={relinkingGraded}
                    className="flex items-center gap-2"
                  >
                    {relinkingGraded ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Link className="w-3 h-3" />
                    )}
                    {relinkingGraded ? 'Relinking...' : `Relink to ${row.grading_company || 'PSA'} Barcode`}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Enforced Barcode</p>
                  <p className="font-mono text-sm">{typeof snapshot.graded === 'object' && snapshot.graded.enforcedBarcode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Decision</p>
                  <p className="font-medium capitalize">{typeof snapshot.graded === 'object' && snapshot.graded.decision?.replace('-', ' ')}</p>
                </div>
              </div>
              
              {typeof snapshot.graded === 'object' && snapshot.graded.relinked && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-800 font-medium">✓ Relinked via Admin Tool</p>
                </div>
              )}
              
              {/* Show collisions if any */}
              {typeof snapshot.graded === 'object' && snapshot.graded.collisions && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded">
                  <p className="text-sm font-medium text-destructive-foreground mb-2">SKU Collisions Detected</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Found variants with SKU "{snapshot.graded.collisions.sku}" but different barcodes:
                  </p>
                  <div className="space-y-1">
                    {snapshot.graded.collisions.candidates?.map((candidate: any, idx: number) => (
                      <div key={idx} className="text-xs font-mono bg-background p-2 rounded">
                        Product {candidate.productId}, Variant {candidate.variantId} - Barcode: {candidate.barcode || 'none'}
                        {typeof snapshot.store === 'object' && snapshot.store?.slug && (
                          <div className="mt-1 flex gap-2">
                            <a
                              href={`https://admin.shopify.com/store/${snapshot.store.slug}/products/${candidate.productId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View Product
                            </a>
                            <a
                              href={`https://admin.shopify.com/store/${snapshot.store.slug}/products/${candidate.productId}/variants/${candidate.variantId}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View Variant
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Target Location */}
          <div>
            <div className="text-sm font-medium text-muted-foreground">Target Location</div>
              <div className="flex items-center gap-2">
                <span>{locationName || snapshot?.input?.locationId || 'Unknown'}</span>
                {snapshot?.input?.locationGid && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({snapshot?.input?.locationGid})
                </span>
              )}
            </div>
          </div>

          {/* Store Info */}
          {snapshot?.store && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Store</div>
              <div className="flex items-center gap-2">
                <span>{typeof snapshot.store === 'object' ? snapshot.store.domain : snapshot.store}</span>
                {typeof snapshot.store === 'object' && snapshot.store.slug && (
                  <span className="text-xs text-muted-foreground">({snapshot.store.slug})</span>
                )}
              </div>
            </div>
          )}

          {/* Result IDs */}
          {snapshot?.result && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Shopify IDs</div>
              <div className="grid grid-cols-1 gap-2">
                {snapshot?.result?.productId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Product ID: <code>{snapshot?.result?.productId}</code></span>
                    {typeof snapshot.store === 'object' && snapshot.store?.slug && (
                       <Button variant="outline" size="sm" asChild>
                           <a 
                            href={`https://admin.shopify.com/store/${snapshot.store.slug}/products/${snapshot?.result?.productId}`}
                           target="_blank"
                           rel="noopener noreferrer"
                         >
                           <ExternalLink className="w-3 h-3 mr-1" />
                           Open Product
                         </a>
                       </Button>
                    )}
                  </div>
                )}
                {snapshot?.result?.variantId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Variant ID: <code>{snapshot?.result?.variantId}</code></span>
                     {typeof snapshot.store === 'object' && snapshot.store?.slug && snapshot?.result?.productId && (
                       <Button variant="outline" size="sm" asChild>
                           <a 
                            href={`https://admin.shopify.com/store/${snapshot.store.slug}/products/${snapshot?.result?.productId}/variants/${snapshot?.result?.variantId}`}
                           target="_blank"
                           rel="noopener noreferrer"
                         >
                           <ExternalLink className="w-3 h-3 mr-1" />
                           Open Variant
                         </a>
                       </Button>
                     )}
                  </div>
                )}
                {snapshot?.result?.inventoryItemId && (
                  <div className="text-sm">
                    Inventory Item ID: <code>{snapshot?.result?.inventoryItemId}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps */}
          {snapshot?.steps && snapshot?.steps?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Steps</div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Step</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">HTTP</th>
                      <th className="text-left p-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot?.steps?.map((step: any, index: number) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 flex items-center gap-2">
                          {getStepIcon(step)}
                          {step.name}
                        </td>
                        <td className="p-2">
                          <Badge variant={step.ok ? 'default' : 'destructive'} className="text-xs">
                            {getStepStatus(step)}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {step.status && (
                            <code className={step.status >= 400 ? 'text-red-600' : 'text-green-600'}>
                              {step.status}
                            </code>
                          )}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {step.note || (step.data && Object.keys(step.data).length > 0 ? JSON.stringify(step.data) : '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error */}
          {snapshot?.error && (
            <div>
              <div className="text-sm font-medium text-red-600 mb-2">Error</div>
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                {snapshot?.error}
              </div>
            </div>
          )}

          {/* Raw Snapshot */}
          <Collapsible open={expandedJson} onOpenChange={setExpandedJson}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full">
                {expandedJson ? <ChevronDown className="w-4 h-4 mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                Raw Snapshot JSON
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-64 mt-2">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}