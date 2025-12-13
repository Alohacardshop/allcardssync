import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ExternalLink, Check } from 'lucide-react';

interface ItemCardProps {
  item: {
    id: string;
    brand_title?: string;
    subject?: string;
    sku?: string;
    main_category?: string;
    price?: number;
    variant?: string;
    printed_at?: string;
    shopify_product_id?: string;
    store_key?: string;
    shopify_snapshot?: { tags?: string[] };
    source_payload?: { tags?: string[] };
  };
  index: number;
  isSelected: boolean;
  onSelect: (checked: boolean, isShiftKey: boolean) => void;
  onViewDetails: () => void;
  getShopifyAdminUrl: (item: any) => string | null;
}

export function ItemCard({
  item,
  index,
  isSelected,
  onSelect,
  onViewDetails,
  getShopifyAdminUrl,
}: ItemCardProps) {
  const tags = [
    ...((item.shopify_snapshot as any)?.tags || []),
    ...((item.source_payload as any)?.tags || []),
  ];

  const shopifyUrl = getShopifyAdminUrl(item);

  return (
    <Card className={isSelected ? 'ring-2 ring-primary' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(!isSelected, e.shiftKey);
            }}
            className="mt-1"
          />
          <div className="flex-1 flex items-start justify-between">
            <div className="space-y-1">
              <div className="font-medium">{item.brand_title || item.subject}</div>
              <div className="text-sm text-muted-foreground">
                SKU: {item.sku} • {item.main_category}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right space-y-2">
              <div className="font-medium">${item.price}</div>
              <div className="text-sm text-muted-foreground">{item.variant}</div>
              {item.printed_at && (
                <Badge variant="secondary" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Printed
                </Badge>
              )}
              <div className="flex gap-1 justify-end mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails();
                  }}
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {shopifyUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    title="View in Shopify"
                  >
                    <a
                      href={shopifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
