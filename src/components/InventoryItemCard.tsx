import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  InventoryItemHeader,
  InventoryItemMetaRow,
  InventoryItemTagsRow,
  InventoryItemActionsRow,
} from '@/components/inventory-card';
import { generateTitle } from '@/utils/generateTitle';
import type { InventoryItem } from '@/types/inventory';
import type { CachedLocation } from '@/hooks/useLocationNames';
import type { InventoryLock } from '@/hooks/useInventoryLocks';

interface InventoryItemCardProps {
  item: InventoryItem;
  isSelected: boolean;
  isExpanded: boolean;
  isAdmin: boolean;
  syncingRowId: string | null;
  locationsMap?: Map<string, CachedLocation>;
  /** Lock info if item is currently locked */
  lockInfo?: InventoryLock | null;
  /** Whether quantity editing is disabled (e.g., Shopify truth mode) */
  quantityReadOnly?: boolean;
  /** Reason for read-only quantity, shown in tooltip */
  quantityReadOnlyReason?: string;
  onToggleSelection: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
  onSync: (item: InventoryItem) => void;
  onRetrySync: (item: InventoryItem) => void;
  onResync: (item: InventoryItem) => void;
  onRemove: (item: InventoryItem) => void;
  onDelete?: (item: InventoryItem) => void;
  onSyncDetails: (item: InventoryItem) => void;
}

export const InventoryItemCard = memo(({
  item,
  isSelected,
  isExpanded,
  isAdmin,
  syncingRowId,
  locationsMap,
  lockInfo,
  quantityReadOnly,
  quantityReadOnlyReason,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails
}: InventoryItemCardProps) => {
  const queryClient = useQueryClient();

  // Prefetch item details on hover for instant expansion
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['inventory-item-detail', item.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('intake_items')
          .select(`
            id,
            catalog_snapshot,
            psa_snapshot,
            image_urls,
            shopify_snapshot,
            pricing_snapshot,
            label_snapshot,
            grading_data,
            source_payload,
            processing_notes,
            shopify_sync_snapshot,
            last_shopify_sync_error,
            last_shopify_synced_at,
            pushed_at,
            cost,
            vendor,
            intake_lots(lot_number, status)
          `)
          .eq('id', item.id)
          .single();
        
        if (error) throw error;
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  // Determine border color based on sync status
  const getBorderClass = () => {
    const status = item.shopify_sync_status as string | null;
    if (status === 'error' || status === 'failed') return "border-l-destructive";
    if (status === 'synced' && item.shopify_product_id) return "border-l-primary";
    if (status === 'pending') return "border-l-warning";
    if (status === 'success') return "border-l-primary";
    return "border-l-transparent";
  };

  const title = generateTitle(item);

  return (
    <TooltipProvider>
      <Card 
        className={cn(
          "transition-all duration-200 border-l-4",
          getBorderClass(),
          isSelected && "ring-2 ring-primary",
          item.deleted_at && "opacity-50"
        )}
        onMouseEnter={handleMouseEnter}
      >
        <InventoryItemHeader
          item={item}
          title={title}
          isSelected={isSelected}
          isExpanded={isExpanded}
          locationsMap={locationsMap}
          lockInfo={lockInfo}
          onToggleSelection={onToggleSelection}
          onToggleExpanded={onToggleExpanded}
        />
        
        <CardContent className="pt-0 space-y-3">
          <InventoryItemMetaRow 
            item={item} 
            quantityReadOnly={quantityReadOnly}
            quantityReadOnlyReason={quantityReadOnlyReason}
          />
          <InventoryItemTagsRow item={item} />
          <InventoryItemActionsRow
            item={item}
            isAdmin={isAdmin}
            syncingRowId={syncingRowId}
            onSync={onSync}
            onRetrySync={onRetrySync}
            onResync={onResync}
            onRemove={onRemove}
            onDelete={onDelete}
            onSyncDetails={onSyncDetails}
          />
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  // Use joined strings instead of JSON.stringify for array comparison (much faster)
  const prevTags = prevProps.item.shopify_tags?.join('|') ?? '';
  const nextTags = nextProps.item.shopify_tags?.join('|') ?? '';
  const prevNormTags = prevProps.item.normalized_tags?.join('|') ?? '';
  const nextNormTags = nextProps.item.normalized_tags?.join('|') ?? '';

  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.sku === nextProps.item.sku &&
    prevProps.item.price === nextProps.item.price &&
    prevProps.item.quantity === nextProps.item.quantity &&
    prevProps.item.shopify_sync_status === nextProps.item.shopify_sync_status &&
    prevProps.item.printed_at === nextProps.item.printed_at &&
    prevProps.item.list_on_ebay === nextProps.item.list_on_ebay &&
    prevProps.item.ebay_sync_status === nextProps.item.ebay_sync_status &&
    prevProps.item.ebay_listing_id === nextProps.item.ebay_listing_id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.syncingRowId === nextProps.syncingRowId &&
    prevProps.quantityReadOnly === nextProps.quantityReadOnly &&
    prevProps.lockInfo?.id === nextProps.lockInfo?.id &&
    prevTags === nextTags &&
    prevNormTags === nextNormTags
  );
});

InventoryItemCard.displayName = 'InventoryItemCard';
