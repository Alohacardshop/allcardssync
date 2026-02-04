import React, { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { TagEditor } from '@/components/inventory/TagEditor';
import type { InventoryItem } from '@/types/inventory';

interface InventoryItemTagsRowProps {
  item: InventoryItem;
}

function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'tcg': return '🎴 TCG';
    case 'comics': return '📚 Comics';
    case 'pokemon': return '⚡ Pokemon';
    case 'sports': return '🏈 Sports';
    default: return category;
  }
}

export const InventoryItemTagsRow = memo(({ item }: InventoryItemTagsRowProps) => {
  const shopifyTags = item.shopify_tags && Array.isArray(item.shopify_tags) ? item.shopify_tags : [];

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {item.main_category && (
        <Badge variant="secondary" className="text-xs">
          {getCategoryEmoji(item.main_category)}
        </Badge>
      )}
      {item.sub_category && (
        <Badge variant="outline" className="text-xs">
          {item.sub_category}
        </Badge>
      )}
      {/* Show first 3 shopify tags */}
      {shopifyTags.slice(0, 3).map((tag: string) => (
        <Badge key={tag} variant="outline" className="text-xs bg-muted/50">
          {tag}
        </Badge>
      ))}
      {shopifyTags.length > 3 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{shopifyTags.length - 3} more
        </Badge>
      )}
      {/* Tag Editor */}
      <TagEditor
        itemId={item.id}
        currentTags={item.shopify_tags || []}
        normalizedTags={item.normalized_tags || []}
        shopifyProductId={item.shopify_product_id}
        storeKey={item.store_key}
      />
    </div>
  );
});

InventoryItemTagsRow.displayName = 'InventoryItemTagsRow';
