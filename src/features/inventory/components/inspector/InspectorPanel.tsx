import React, { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ChevronUp, ChevronDown, Copy, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInventoryItemDetail } from '@/hooks/useInventoryItemDetail';
import { getLocationNickname } from '@/lib/locationNicknames';
import { cn } from '@/lib/utils';

// Tab content components
import { OverviewTab } from './tabs/OverviewTab';
import { ShopifyTab } from './tabs/ShopifyTab';
import { EbayTab } from './tabs/EbayTab';
import { PrintingTab } from './tabs/PrintingTab';
import { HistoryTab } from './tabs/HistoryTab';

import type { InventoryListItem } from '../../types';
import type { CachedLocation } from '@/hooks/useLocationNames';

interface InspectorPanelProps {
  item: InventoryListItem | null;
  items: InventoryListItem[];
  locationsMap?: Map<string, CachedLocation>;
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

export const InspectorPanel = React.memo(({
  item,
  items,
  locationsMap,
  onClose,
  onNavigate,
  onResync,
  onPrint,
  isResyncing,
}: InspectorPanelProps) => {
  // Fetch detail data lazily when item is selected
  const { data: detailData, isLoading: isLoadingDetail } = useInventoryItemDetail(
    item?.id || null,
    !!item
  );

  // Find current index for navigation
  const currentIndex = item ? items.findIndex(i => i.id === item.id) : -1;
  const prevItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  // Keyboard navigation - up/down arrows
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowUp' && prevItem) {
        e.preventDefault();
        onNavigate(prevItem);
      } else if (e.key === 'ArrowDown' && nextItem) {
        e.preventDefault();
        onNavigate(nextItem);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, prevItem, nextItem, onNavigate, onClose]);

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

  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <div className="space-y-2">
          <p className="text-sm font-medium">No item selected</p>
          <p className="text-xs">Click a row in the table to view details</p>
        </div>
      </div>
    );
  }

  const title = generateTitle(item);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - compact with navigation */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold truncate">{title}</h2>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{item.sku}</p>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {/* Up/Down navigation */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => prevItem && onNavigate(prevItem)}
              disabled={!prevItem}
              className="h-7 w-7"
              title="Previous item (↑)"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => nextItem && onNavigate(nextItem)}
              disabled={!nextItem}
              className="h-7 w-7"
              title="Next item (↓)"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-5 mx-1" />
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {items.length > 1 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {currentIndex + 1} of {items.length}
          </p>
        )}
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 px-4 border-b border-border">
          <TabsList className="h-9 w-full justify-start gap-0 bg-transparent p-0">
            <TabsTrigger 
              value="overview" 
              className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="shopify"
              className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Shopify
            </TabsTrigger>
            <TabsTrigger 
              value="ebay"
              className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              eBay
            </TabsTrigger>
            <TabsTrigger 
              value="printing"
              className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Printing
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="overview" className="p-4 m-0">
                <OverviewTab 
                  item={item} 
                  detailData={detailData}
                  locationsMap={locationsMap} 
                />
              </TabsContent>

              <TabsContent value="shopify" className="p-4 m-0">
                <ShopifyTab 
                  item={item}
                  detailData={detailData}
                  onResync={() => onResync(item)}
                  isResyncing={isResyncing}
                />
              </TabsContent>

              <TabsContent value="ebay" className="p-4 m-0">
                <EbayTab item={item} />
              </TabsContent>

              <TabsContent value="printing" className="p-4 m-0">
                <PrintingTab 
                  item={item}
                  onPrint={() => onPrint(item)}
                />
              </TabsContent>

              <TabsContent value="history" className="p-4 m-0">
                <HistoryTab 
                  item={item}
                  detailData={detailData}
                />
              </TabsContent>
            </>
          )}
        </ScrollArea>

        {/* Footer actions */}
        <div className="shrink-0 px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyDetails}
            className="w-full h-8 text-xs"
          >
            <Copy className="h-3 w-3 mr-2" />
            Copy Details
          </Button>
        </div>
      </Tabs>
    </div>
  );
});

InspectorPanel.displayName = 'InspectorPanel';
