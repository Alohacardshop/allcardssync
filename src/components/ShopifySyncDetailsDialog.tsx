import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, ChevronDown, ChevronRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface ShopifySyncDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: any;
}

export function ShopifySyncDetailsDialog({ open, onOpenChange, row }: ShopifySyncDetailsDialogProps) {
  const [locationName, setLocationName] = useState<string>('');
  const [expandedJson, setExpandedJson] = useState(false);

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

  if (!row?.shopify_sync_snapshot) {
    return null;
  }

  const snapshot = row.shopify_sync_snapshot;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Shopify Sync Details
            <Badge variant={isSuccess ? 'default' : 'destructive'}>
              {row.shopify_sync_status?.toUpperCase() || 'UNKNOWN'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">SKU</div>
              <div className="font-mono">{snapshot.input?.sku || row.sku}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Quantity</div>
              <div>{snapshot.input?.quantity || row.quantity}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Last Synced</div>
              <div>{row.last_shopify_synced_at ? formatDistanceToNow(new Date(row.last_shopify_synced_at), { addSuffix: true }) : 'Never'}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Correlation ID</div>
              <div className="font-mono text-xs">{row.last_shopify_correlation_id}</div>
            </div>
          </div>

          {/* Graded item barcode enforcement details */}
          {snapshot.graded && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="font-medium text-sm mb-3">Graded Item Sync Details</h4>
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
              <span>{locationName || snapshot.input?.locationId || 'Unknown'}</span>
              {snapshot.input?.locationGid && (
                <span className="text-xs text-muted-foreground font-mono">
                  ({snapshot.input.locationGid})
                </span>
              )}
            </div>
          </div>

          {/* Store Info */}
          {snapshot.store && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Store</div>
              <div className="flex items-center gap-2">
                <span>{snapshot.store.domain}</span>
                <span className="text-xs text-muted-foreground">({snapshot.store.slug})</span>
              </div>
            </div>
          )}

          {/* Result IDs */}
          {snapshot.result && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Shopify IDs</div>
              <div className="grid grid-cols-1 gap-2">
                {snapshot.result.productId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Product ID: <code>{snapshot.result.productId}</code></span>
                    {snapshot.store?.slug && (
                      <Button variant="outline" size="sm" asChild>
                        <a 
                          href={`https://${snapshot.store.slug}.myshopify.com/admin/products/${snapshot.result.productId}`}
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
                {snapshot.result.variantId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Variant ID: <code>{snapshot.result.variantId}</code></span>
                    {snapshot.store?.slug && snapshot.result.productId && (
                      <Button variant="outline" size="sm" asChild>
                        <a 
                          href={`https://${snapshot.store.slug}.myshopify.com/admin/products/${snapshot.result.productId}/variants/${snapshot.result.variantId}`}
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
                {snapshot.result.inventoryItemId && (
                  <div className="text-sm">
                    Inventory Item ID: <code>{snapshot.result.inventoryItemId}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps */}
          {snapshot.steps && snapshot.steps.length > 0 && (
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
                    {snapshot.steps.map((step: any, index: number) => (
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
          {snapshot.error && (
            <div>
              <div className="text-sm font-medium text-red-600 mb-2">Error</div>
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                {snapshot.error}
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