import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, RefreshCw, Copy, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import type { InventoryListItem } from '../../../types';

interface ShopifyTabProps {
  item: InventoryListItem;
  detailData?: {
    last_shopify_synced_at?: string | null;
    last_shopify_sync_error?: string | null;
    shopify_sync_snapshot?: unknown;
    cost?: number | null;
    vendor?: string | null;
  } | null;
  onResync: () => void;
  isResyncing?: boolean;
}

const getSyncStatus = (item: InventoryListItem) => {
  const status = item.shopify_sync_status as string | null;
  if (status === 'error') return { label: 'Error', variant: 'destructive' as const };
  if (status === 'synced' && item.shopify_product_id) return { label: 'Synced', variant: 'default' as const };
  if (status === 'queued' || status === 'processing') return { label: 'Syncing', variant: 'outline' as const, loading: true };
  if (status === 'pending') return { label: 'Pending', variant: 'outline' as const };
  if (item.shopify_product_id) return { label: 'Synced', variant: 'default' as const };
  return { label: 'Not Synced', variant: 'outline' as const };
};

const getShopifyStatus = (item: InventoryListItem): string => {
  const snapshot = item.shopify_snapshot;
  if (!snapshot || typeof snapshot !== 'object') return 'Unknown';
  const status = (snapshot as Record<string, unknown>).status as string | undefined;
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const getShopifyStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'draft':
      return <Badge variant="outline">Draft</Badge>;
    case 'archived':
      return <Badge variant="secondary">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const ShopifyTab = React.memo(({ item, detailData, onResync, isResyncing }: ShopifyTabProps) => {
  const syncStatus = getSyncStatus(item);
  const productId = item.shopify_product_id;
  const variantId = item.shopify_variant_id;
  const inventoryItemId = item.shopify_inventory_item_id;
  
  const numericProductId = productId?.split('/').pop();
  
  const snapshot = item.shopify_snapshot;
  const shopifyCreatedAt = snapshot?.created_at as string | undefined;
  const shopifyUpdatedAt = snapshot?.updated_at as string | undefined;
  const compareAtPrice = snapshot?.compare_at_price;
  const shopifyStatus = getShopifyStatus(item);
  const shopifyTags = item.shopify_tags;
  
  const cost = detailData?.cost ?? item.cost;
  const vendor = detailData?.vendor ?? item.vendor;
  
  const lastSyncedAt = item.last_shopify_synced_at || detailData?.last_shopify_synced_at;
  const lastSyncError = item.last_shopify_sync_error || detailData?.last_shopify_sync_error;

  const handleCopyId = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const isNotSynced = !productId;

  return (
    <div className="space-y-4">
      {isNotSynced ? (
        <div className="p-4 bg-muted/50 rounded-md text-center">
          <p className="text-sm text-muted-foreground">Not synced yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            This item hasn't been sent to Shopify
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sync Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sync Status:</span>
              <Badge 
                variant={syncStatus.variant}
                className={syncStatus.loading ? 'animate-pulse' : ''}
              >
                {syncStatus.loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {syncStatus.label}
              </Badge>
            </div>
            
            {productId && numericProductId && (
              <a 
                href={`https://${item.store_key}.myshopify.com/admin/products/${numericProductId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Admin
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Product Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Product Status:</span>
            {getShopifyStatusBadge(shopifyStatus)}
          </div>

          {/* IDs */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-md">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Product ID</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs truncate max-w-[140px]">{numericProductId}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5"
                  onClick={() => handleCopyId('Product ID', productId || '')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {variantId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Variant ID</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[140px]">{variantId.split('/').pop()}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={() => handleCopyId('Variant ID', variantId)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            
            {inventoryItemId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Inventory Item ID</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[140px]">{inventoryItemId.split('/').pop()}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={() => handleCopyId('Inventory Item ID', inventoryItemId)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground block">Entered Shopify</span>
              <p className="text-sm">
                {shopifyCreatedAt 
                  ? format(new Date(shopifyCreatedAt), 'MMM d, yyyy')
                  : <span className="text-muted-foreground italic">Unknown</span>
                }
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Last Updated</span>
              <p className="text-sm">
                {shopifyUpdatedAt 
                  ? format(new Date(shopifyUpdatedAt), 'MMM d, yyyy')
                  : <span className="text-muted-foreground italic">Unknown</span>
                }
              </p>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-xs text-muted-foreground block">Price</span>
              <p className="text-sm font-medium">
                {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Cost</span>
              <p className="text-sm">
                {cost != null ? `$${cost.toFixed(2)}` : <span className="text-muted-foreground italic">—</span>}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Compare At</span>
              <p className="text-sm">
                {compareAtPrice != null 
                  ? `$${typeof compareAtPrice === 'string' ? parseFloat(compareAtPrice).toFixed(2) : compareAtPrice.toFixed(2)}`
                  : <span className="text-muted-foreground italic">—</span>
                }
              </p>
            </div>
          </div>

          {vendor && (
            <div>
              <span className="text-xs text-muted-foreground block">Vendor</span>
              <p className="text-sm">{vendor}</p>
            </div>
          )}

          {shopifyTags && shopifyTags.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Tags</span>
              <div className="flex flex-wrap gap-1">
                {shopifyTags.slice(0, 6).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {shopifyTags.length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{shopifyTags.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Last Sync */}
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Sync</span>
              <span className="text-xs">
                {lastSyncedAt 
                  ? formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })
                  : <span className="text-muted-foreground italic">Never</span>
                }
              </span>
            </div>
          </div>

          {lastSyncError && (
            <div className="p-2 bg-destructive/10 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-medium text-destructive">Sync Error</span>
                <p className="text-xs text-destructive/80 mt-0.5">{lastSyncError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resync Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onResync}
        disabled={isResyncing || item.deleted_at !== null || item.sold_at !== null}
        className="w-full"
      >
        {isResyncing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {productId ? 'Resync to Shopify' : 'Sync to Shopify'}
      </Button>
    </div>
  );
});

ShopifyTab.displayName = 'ShopifyTab';
