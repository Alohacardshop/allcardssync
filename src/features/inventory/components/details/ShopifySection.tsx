import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { InventoryListItem } from '../../types';

interface ShopifySectionProps {
  item: InventoryListItem;
  detailData?: {
    last_shopify_synced_at?: string | null;
    last_shopify_sync_error?: string | null;
    shopify_sync_snapshot?: unknown;
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

export const ShopifySection = React.memo(({ item, detailData, onResync, isResyncing }: ShopifySectionProps) => {
  const syncStatus = getSyncStatus(item);
  const productId = item.shopify_product_id;
  
  // Extract numeric ID for admin URL
  const numericProductId = productId?.split('/').pop();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Shopify</h3>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
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
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View in Shopify
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {productId && (
        <div>
          <span className="text-sm text-muted-foreground">Product ID</span>
          <p className="font-mono text-xs text-muted-foreground truncate">{productId}</p>
        </div>
      )}

      {detailData?.last_shopify_synced_at && (
        <div>
          <span className="text-sm text-muted-foreground">Last Sync</span>
          <p className="text-sm">
            {formatDistanceToNow(new Date(detailData.last_shopify_synced_at), { addSuffix: true })}
          </p>
        </div>
      )}

      {detailData?.last_shopify_sync_error && (
        <div className="p-2 bg-destructive/10 rounded-md">
          <span className="text-sm font-medium text-destructive">Error</span>
          <p className="text-xs text-destructive/80 mt-0.5">{detailData.last_shopify_sync_error}</p>
        </div>
      )}

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

ShopifySection.displayName = 'ShopifySection';
