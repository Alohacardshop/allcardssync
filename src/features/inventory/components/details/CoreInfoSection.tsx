import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { InventoryListItem } from '../../types';

interface CoreInfoSectionProps {
  item: InventoryListItem;
  title: string;
}

export const CoreInfoSection = React.memo(({ item, title }: CoreInfoSectionProps) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Core Info</h3>
      <div className="space-y-2">
        <div>
          <span className="text-sm text-muted-foreground">Title</span>
          <p className="font-medium">{title}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-sm text-muted-foreground">SKU</span>
            <p className="font-mono text-sm">{item.sku || '—'}</p>
          </div>
          
          {item.year && (
            <div>
              <span className="text-sm text-muted-foreground">Year</span>
              <p className="text-sm">{item.year}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {item.brand_title && (
            <div>
              <span className="text-sm text-muted-foreground">Set/Brand</span>
              <p className="text-sm">{item.brand_title}</p>
            </div>
          )}
          
          {item.card_number && (
            <div>
              <span className="text-sm text-muted-foreground">Card #</span>
              <p className="text-sm">#{item.card_number}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {item.variant && (
            <div>
              <span className="text-sm text-muted-foreground">Variant</span>
              <p className="text-sm">{item.variant}</p>
            </div>
          )}
          
          <div>
            <span className="text-sm text-muted-foreground">Condition</span>
            <div className="flex items-center gap-1.5">
              {item.psa_cert || item.cgc_cert ? (
                <Badge variant="default" className="text-xs">
                  {item.grading_company || 'PSA'} {item.grade}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Raw</Badge>
              )}
            </div>
          </div>
        </div>

        {item.main_category && (
          <div>
            <span className="text-sm text-muted-foreground">Category</span>
            <p className="text-sm capitalize">{item.main_category}</p>
          </div>
        )}
      </div>
    </div>
  );
});

CoreInfoSection.displayName = 'CoreInfoSection';
