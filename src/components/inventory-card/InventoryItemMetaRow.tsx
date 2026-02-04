import React, { memo, useCallback } from 'react';
import { DollarSign, Package, Calendar, Tag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { InlineQuantityEditor } from './InlineQuantityEditor';
import { checkEbayPrice, generateEbaySearchQuery } from '@/lib/ebayPriceCheck';
import type { InventoryItem } from '@/types/inventory';

interface InventoryItemMetaRowProps {
  item: InventoryItem;
  /** Whether quantity editing is disabled (e.g., Shopify truth mode) */
  quantityReadOnly?: boolean;
  /** Reason for read-only quantity, shown in tooltip */
  quantityReadOnlyReason?: string;
}

export const InventoryItemMetaRow = memo(({ 
  item, 
  quantityReadOnly,
  quantityReadOnlyReason 
}: InventoryItemMetaRowProps) => {
  const queryClient = useQueryClient();

  const handleCheckEbayPrice = useCallback(async () => {
    try {
      const searchQuery = generateEbaySearchQuery(item);
      if (!searchQuery) {
        toast.error('Unable to generate search query for this item');
        return;
      }
      
      toast.loading('Checking eBay prices...', { id: 'ebay-check' });
      
      await checkEbayPrice(item.id, searchQuery, item.price || 0);
      
      toast.success('eBay prices updated!', { id: 'ebay-check' });
      
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check eBay prices';
      toast.error(errorMessage, { id: 'ebay-check' });
    }
  }, [item, queryClient]);

  const ebayPriceCheck = item.ebay_price_check as { ebay_average?: number; difference_percent?: number } | null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      <div className="flex items-center space-x-1 flex-wrap gap-y-1">
        <DollarSign className="h-3 w-3 text-muted-foreground" />
        <span>${parseFloat(String(item.price || 0)).toFixed(2)}</span>
        {ebayPriceCheck ? (
          <span className="flex items-center space-x-1 text-primary">
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">
              eBay: ${Number(ebayPriceCheck.ebay_average || 0).toFixed(2)}
            </span>
            <span className={
              Number(ebayPriceCheck.difference_percent || 0) > 0 
                ? "text-primary" 
                : "text-destructive"
            }>
              ({Number(ebayPriceCheck.difference_percent || 0) > 0 ? '+' : ''}
              {Number(ebayPriceCheck.difference_percent || 0).toFixed(0)}%)
            </span>
          </span>
        ) : (
          <button
            onClick={handleCheckEbayPrice}
            className="text-primary hover:text-primary/80 hover:underline"
          >
            Check eBay
          </button>
        )}
      </div>
      <div className="flex items-center space-x-1">
        <Package className="h-3 w-3 text-muted-foreground" />
        <InlineQuantityEditor
          itemId={item.id}
          quantity={item.quantity}
          shopifyProductId={item.shopify_product_id}
          shopifyInventoryItemId={item.shopify_inventory_item_id}
          readOnly={quantityReadOnly}
          readOnlyReason={quantityReadOnlyReason}
        />
      </div>
      <div className="flex items-center space-x-1">
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
      </div>
      <div className="flex items-center space-x-1">
        <Tag className="h-3 w-3 text-muted-foreground" />
        <span>{item.type || 'Raw'}</span>
        {item.variant && (
          <span className="text-muted-foreground">• {item.variant}</span>
        )}
      </div>
    </div>
  );
});

InventoryItemMetaRow.displayName = 'InventoryItemMetaRow';
