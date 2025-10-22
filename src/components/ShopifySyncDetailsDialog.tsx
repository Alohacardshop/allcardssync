import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, ChevronDown, ChevronRight, CheckCircle, XCircle, AlertCircle, RefreshCw, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface ShopifySyncDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: any;
  selectedStoreKey?: string;
  selectedLocationGid?: string;
  onRefresh?: () => void;
}

export function ShopifySyncDetailsDialog({ open, onOpenChange, row, selectedStoreKey, selectedLocationGid, onRefresh }: ShopifySyncDetailsDialogProps) {
  const [locationName, setLocationName] = useState<string>('');
  const [expandedJson, setExpandedJson] = useState(false);
  const [relinkingGraded, setRelinkingGraded] = useState(false);
  const [resyncing, setResyncing] = useState(false);

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
          console.error('Failed to fetch location name:', error);
        }
      };
      
      fetchLocationName();
    }
  }, [open, row]);

  // Always show dialog if row exists, even without sync snapshot

  const snapshot = row.shopify_sync_snapshot || {};
  const isSuccess = row.shopify_sync_status === 'success';
  
  const getStepIcon = (step: any) => {
    if (step.ok) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (step.ok === false) return <XCircle className="w-4 h-4 text-red-500" />;
    return <AlertCircle className="w-4 h-4 text-yellow-500" />;
  };

  const getStepStatus = (step: any) => {
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
      console.error('Relink failed:', e);
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
      console.error('Resync failed:', e);
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
                    Resync to Shopify
                  </>
                )}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Item Information */}
          <div className="border rounded-lg p-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">Item Information</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Basic Info */}
              <div>
                <div className="text-xs font-medium text-muted-foreground">SKU</div>
                <div className="font-mono text-sm">{row.sku}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Year</div>
                <div className="text-sm">{row.year || row.catalog_snapshot?.year || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Brand / Title / Game</div>
                <div className="text-sm">{row.brand_title || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Subject</div>
                <div className="text-sm">{row.subject || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Category</div>
                <div className="text-sm">{row.category || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Variant</div>
                <div className="text-sm">{row.variant || row.catalog_snapshot?.varietyPedigree || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Card Number</div>
                <div className="text-sm">{row.card_number || 'N/A'}</div>
              </div>
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
              <div>
                <div className="text-xs font-medium text-muted-foreground">Price</div>
                <div className="text-sm">${parseFloat(row.price || '0').toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Cost</div>
                <div className="text-sm">{row.cost ? `$${parseFloat(row.cost).toFixed(2)}` : 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Quantity</div>
                <div className="text-sm">{row.quantity}</div>
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

          {/* Graded item barcode enforcement details */}
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
                  <p className="font-mono text-sm">{snapshot.graded.enforcedBarcode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Decision</p>
                  <p className="font-medium capitalize">{snapshot.graded.decision?.replace('-', ' ')}</p>
                </div>
              </div>
              
              {snapshot.graded.relinked && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-800 font-medium">✓ Relinked via Admin Tool</p>
                </div>
              )}
              
              {/* Show collisions if any */}
              {snapshot.graded.collisions && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded">
                  <p className="text-sm font-medium text-destructive-foreground mb-2">SKU Collisions Detected</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Found variants with SKU "{snapshot.graded.collisions.sku}" but different barcodes:
                  </p>
                  <div className="space-y-1">
                    {snapshot.graded.collisions.candidates?.map((candidate: any, idx: number) => (
                      <div key={idx} className="text-xs font-mono bg-background p-2 rounded">
                        Product {candidate.productId}, Variant {candidate.variantId} - Barcode: {candidate.barcode || 'none'}
                        {snapshot.store?.slug && (
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
                <span>{snapshot?.store?.domain}</span>
                <span className="text-xs text-muted-foreground">({snapshot?.store?.slug})</span>
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
                    {snapshot?.store?.slug && (
                       <Button variant="outline" size="sm" asChild>
                           <a 
                            href={`https://admin.shopify.com/store/${snapshot?.store?.slug}/products/${snapshot?.result?.productId}`}
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
                     {snapshot?.store?.slug && snapshot?.result?.productId && (
                       <Button variant="outline" size="sm" asChild>
                           <a 
                            href={`https://admin.shopify.com/store/${snapshot?.store?.slug}/products/${snapshot?.result?.productId}/variants/${snapshot?.result?.variantId}`}
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