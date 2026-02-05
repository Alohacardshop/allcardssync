import React, { useCallback, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInventoryItemDetail } from '@/hooks/useInventoryItemDetail';
import { useEbayListing } from '@/hooks/useEbayListing';
import { getLocationNickname } from '@/lib/locationNicknames';
import { CoreInfoSection } from './details/CoreInfoSection';
import { InventorySection } from './details/InventorySection';
import { ShopifySection } from './details/ShopifySection';
import { EbaySection } from './details/EbaySection';
import { PrintingSection } from './details/PrintingSection';
import { MetadataSection } from './details/MetadataSection';
import { ImageGallery } from './details/ImageGallery';
import type { InventoryListItem } from '../types';
import type { CachedLocation } from '@/hooks/useLocationNames';

interface ItemDetailsDrawerProps {
  item: InventoryListItem | null;
  items: InventoryListItem[];
  locationsMap?: Map<string, CachedLocation>;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: InventoryListItem) => void;
  onResync: (item: InventoryListItem) => void;
  onPrint: (item: InventoryListItem) => void;
  isResyncing?: boolean;
}

// Generate title from item
const generateTitle = (item: InventoryListItem): string => {
  const parts: (string | number | null | undefined)[] = [];
  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);
  if (item.grade && (item.psa_cert || item.cgc_cert)) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  }
  return parts.filter(Boolean).join(' ') || 'Unknown Item';
};

export const ItemDetailsDrawer = React.memo(({
  item,
  items,
  locationsMap,
  isOpen,
  onClose,
  onNavigate,
  onResync,
  onPrint,
  isResyncing,
}: ItemDetailsDrawerProps) => {
  const { toggleListOnEbay, isToggling } = useEbayListing();
  
  // Fetch detail data lazily when drawer opens
  const { data: detailData, isLoading: isLoadingDetail } = useInventoryItemDetail(
    item?.id || null,
    isOpen
  );

  // Find current index for navigation
  const currentIndex = item ? items.findIndex(i => i.id === item.id) : -1;
  const prevItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevItem) {
        e.preventDefault();
        onNavigate(prevItem);
      } else if (e.key === 'ArrowRight' && nextItem) {
        e.preventDefault();
        onNavigate(nextItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, prevItem, nextItem, onNavigate]);

  const handleCopyDetails = useCallback(() => {
    if (!item) return;
    
    const locationName = item.shopify_location_gid 
      ? locationsMap?.get(item.shopify_location_gid)?.location_name || 'Unknown'
      : 'No location';
    
    const text = `
SKU: ${item.sku || '—'}
Title: ${generateTitle(item)}
Location: ${getLocationNickname(locationName)}
Price: $${(item.price || 0).toFixed(2)}
Qty: ${item.quantity}
Shopify: ${item.shopify_sync_status || 'Not synced'}
eBay: ${item.ebay_sync_status || 'Not listed'}
    `.trim();
    
    navigator.clipboard.writeText(text);
    toast.success('Details copied to clipboard');
  }, [item, locationsMap]);

  const handleToggleEbay = useCallback(() => {
    if (!item) return;
    toggleListOnEbay(item.id, item.list_on_ebay || false);
  }, [item, toggleListOnEbay]);

  if (!item) return null;

  const title = generateTitle(item);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <TooltipProvider delayDuration={200}>
          {/* Header with navigation */}
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => prevItem && onNavigate(prevItem)}
                disabled={!prevItem}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              
              <div className="flex-1 text-center">
                <SheetTitle className="text-base">Item Details</SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => nextItem && onNavigate(nextItem)}
                disabled={!nextItem}
                className="h-8 px-2"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {items.length > 1 && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                {currentIndex + 1} of {items.length}
              </p>
            )}
          </SheetHeader>

          {/* Scrollable content */}
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-6">
              {/* Images */}
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ImageGallery imageUrls={detailData?.image_urls as string[] | null} />
              )}

              <Separator />

              {/* Core Info */}
              <CoreInfoSection item={item} title={title} />

              <Separator />

              {/* Inventory */}
              <InventorySection 
                item={item} 
                locationsMap={locationsMap}
                detailData={detailData as { cost?: number | null; vendor?: string | null } | null}
              />

              <Separator />

              {/* Shopify */}
              <ShopifySection 
                item={item}
                detailData={detailData as { 
                  last_shopify_synced_at?: string | null; 
                  last_shopify_sync_error?: string | null; 
                  shopify_sync_snapshot?: unknown;
                  cost?: number | null;
                  vendor?: string | null;
                } | null}
                onResync={() => onResync(item)}
                isResyncing={isResyncing}
              />

              <Separator />

              {/* eBay */}
              <EbaySection 
                item={item}
                detailData={null}
                onToggleEbay={handleToggleEbay}
                isTogglingEbay={isToggling === item.id}
              />

              <Separator />

              {/* Printing */}
              <PrintingSection 
                item={item}
                onPrint={() => onPrint(item)}
              />

              <Separator />

              {/* Metadata */}
              <MetadataSection 
                item={item}
                detailData={detailData as { intake_lots?: { lot_number: string; status: string | null } | null } | null}
              />
            </div>
          </ScrollArea>

          {/* Footer with copy action */}
          <div className="px-6 py-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={handleCopyDetails}
              className="w-full"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Details
            </Button>
          </div>
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  );
});

ItemDetailsDrawer.displayName = 'ItemDetailsDrawer';
