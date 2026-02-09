import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import {
  resolveListingPreview,
  type PreviewItem,
  type StoreConfig,
  type ResolvedListing,
  type CategoryMapping,
  type ListingTemplate,
  type EbayCategory,
  type PolicyRecord,
} from '@/lib/ebayPreviewResolver';

interface EbayListingPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PreviewItem[];
  storeKey: string;
  storeConfig: StoreConfig;
  onConfirm: (itemIds: string[]) => void;
  isConfirming?: boolean;
}

export function EbayListingPreview({
  open,
  onOpenChange,
  items,
  storeKey,
  storeConfig,
  onConfirm,
  isConfirming = false,
}: EbayListingPreviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch all resolution data in parallel
  const { data: resolutionData, isLoading } = useQuery({
    queryKey: ['ebay-preview-resolution', storeKey],
    queryFn: async () => {
      const [templatesRes, mappingsRes, categoriesRes, fulfillmentRes, paymentRes, returnRes] =
        await Promise.all([
          supabase
            .from('ebay_listing_templates')
            .select('*')
            .eq('store_key', storeKey)
            .eq('is_active', true),
          supabase
            .from('ebay_category_mappings')
            .select('*')
            .eq('store_key', storeKey)
            .eq('is_active', true)
            .order('priority', { ascending: false }),
          supabase.from('ebay_categories').select('*').eq('is_active', true),
          supabase
            .from('ebay_fulfillment_policies')
            .select('id, policy_id, name')
            .eq('store_key', storeKey),
          supabase
            .from('ebay_payment_policies')
            .select('id, policy_id, name')
            .eq('store_key', storeKey),
          supabase
            .from('ebay_return_policies')
            .select('id, policy_id, name')
            .eq('store_key', storeKey),
        ]);

      return {
        templates: (templatesRes.data || []) as ListingTemplate[],
        mappings: (mappingsRes.data || []) as CategoryMapping[],
        categories: (categoriesRes.data || []) as EbayCategory[],
        fulfillmentPolicies: (fulfillmentRes.data || []) as PolicyRecord[],
        paymentPolicies: (paymentRes.data || []) as PolicyRecord[],
        returnPolicies: (returnRes.data || []) as PolicyRecord[],
      };
    },
    enabled: open && !!storeKey,
  });

  // Resolve all items
  const resolvedListings = useMemo(() => {
    if (!resolutionData) return [];
    return items.map((item) =>
      resolveListingPreview(
        item,
        resolutionData.templates,
        resolutionData.mappings,
        resolutionData.categories,
        storeConfig,
        resolutionData.fulfillmentPolicies,
        resolutionData.paymentPolicies,
        resolutionData.returnPolicies
      )
    );
  }, [items, resolutionData, storeConfig]);

  // Aggregate warnings
  const warningsSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const listing of resolvedListings) {
      for (const w of listing.warnings) {
        counts[w] = (counts[w] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [resolvedListings]);

  const matchSourceLabel = (source: ResolvedListing['templateMatchSource']) => {
    switch (source) {
      case 'brand_mapping': return 'Brand Match';
      case 'category_mapping': return 'Category Match';
      case 'graded_fallback': return 'Graded Fallback';
      case 'default': return 'Default';
      case 'none': return 'None';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Listing Preview — {items.length} item{items.length !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Review how items will appear on eBay before queuing for sync
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Resolving listings...</span>
          </div>
        ) : (
          <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="detail">Detail View</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="flex-1 min-h-0">
              <ScrollArea className="h-[50vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolvedListings.map((listing, idx) => (
                      <TableRow
                        key={listing.item.id}
                        className={listing.warnings.length > 0 ? 'bg-yellow-500/5' : ''}
                      >
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="max-w-[250px]">
                            <div className="truncate font-medium text-sm" title={listing.title}>
                              {listing.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {listing.item.sku || listing.item.psa_cert || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{listing.categoryName}</div>
                          <div className="text-xs text-muted-foreground">
                            {listing.detectedType || 'auto'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {listing.conditionName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{listing.templateName || '(auto)'}</div>
                          <div className="text-xs text-muted-foreground">
                            {matchSourceLabel(listing.templateMatchSource)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {listing.basePrice > 0 ? (
                            <div>
                              <div className="font-medium text-sm">
                                ${listing.finalPrice.toFixed(2)}
                              </div>
                              {listing.markupPercent > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  ${listing.basePrice.toFixed(2)} +{listing.markupPercent}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-destructive text-xs">No price</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {listing.warnings.length > 0 && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            {/* Detail Tab */}
            <TabsContent value="detail" className="flex-1 min-h-0">
              <ScrollArea className="h-[50vh]">
                <div className="space-y-2 pr-4">
                  {resolvedListings.map((listing, idx) => (
                    <ListingDetailRow
                      key={listing.item.id}
                      listing={listing}
                      index={idx}
                      isExpanded={expandedId === listing.item.id}
                      onToggle={() =>
                        setExpandedId(expandedId === listing.item.id ? null : listing.item.id)
                      }
                    />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {/* Warnings Summary */}
        {warningsSummary.length > 0 && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </div>
            {warningsSummary.map(([warning, count]) => (
              <div key={warning} className="text-xs text-muted-foreground pl-6">
                ⚠ {count} item{count !== 1 ? 's' : ''}: {warning}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(items.map((i) => i.id))} disabled={isConfirming}>
            {isConfirming ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Confirm & Queue {items.length} Item{items.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail Row Sub-component ──

function ListingDetailRow({
  listing,
  index,
  isExpanded,
  onToggle,
}: {
  listing: ResolvedListing;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div
          className={`flex items-center gap-3 p-3 rounded-md border text-left hover:bg-muted/50 transition-colors ${
            listing.warnings.length > 0 ? 'border-yellow-500/30' : 'border-border'
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{listing.title}</div>
            <div className="text-xs text-muted-foreground">
              {listing.templateName || '(auto)'} · {listing.categoryName} · {listing.conditionName}
              {listing.finalPrice > 0 && ` · $${listing.finalPrice.toFixed(2)}`}
            </div>
          </div>
          {listing.warnings.length > 0 && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-500/30 text-xs shrink-0">
              {listing.warnings.length} warning{listing.warnings.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-10 mr-2 mb-2 p-4 rounded-md border bg-muted/30 space-y-4 text-sm">
          {/* Title */}
          <DetailSection label="Title">
            <span className={listing.title.length > 80 ? 'text-destructive' : ''}>
              {listing.title}
              <span className="text-muted-foreground ml-2">({listing.title.length}/80)</span>
            </span>
          </DetailSection>

          {/* Category & Condition */}
          <div className="grid grid-cols-2 gap-4">
            <DetailSection label="Category">
              {listing.categoryName}
              <span className="text-muted-foreground ml-1 text-xs">({listing.categoryId})</span>
            </DetailSection>
            <DetailSection label="Condition">
              {listing.conditionName}
              <span className="text-muted-foreground ml-1 text-xs">({listing.conditionId})</span>
            </DetailSection>
          </div>

          {/* Template */}
          <DetailSection label="Template">
            {listing.templateName || '(none)'}
            <Badge variant="secondary" className="ml-2 text-xs">
              {listing.templateMatchSource}
            </Badge>
          </DetailSection>

          {/* Price */}
          <DetailSection label="Price">
            {listing.basePrice > 0 ? (
              <>
                ${listing.basePrice.toFixed(2)}
                {listing.markupPercent > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    + {listing.markupPercent}% = ${listing.finalPrice.toFixed(2)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-destructive">No price set</span>
            )}
          </DetailSection>

          {/* Policies */}
          <div className="grid grid-cols-3 gap-4">
            <DetailSection label="Shipping">
              {listing.fulfillmentPolicyName || <span className="text-destructive">Not set</span>}
            </DetailSection>
            <DetailSection label="Payment">
              {listing.paymentPolicyName || <span className="text-destructive">Not set</span>}
            </DetailSection>
            <DetailSection label="Returns">
              {listing.returnPolicyName || <span className="text-destructive">Not set</span>}
            </DetailSection>
          </div>

          {/* Aspects */}
          <DetailSection label="Item Aspects">
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(listing.aspects).map(([key, values]) => (
                <Badge key={key} variant="outline" className="text-xs font-normal">
                  <Tag className="h-3 w-3 mr-1" />
                  {key}: {values.join(', ')}
                </Badge>
              ))}
            </div>
          </DetailSection>

          {/* Images */}
          <DetailSection label="Images">
            {listing.imageUrls.length > 0 ? (
              <div className="flex gap-2 mt-1">
                {listing.imageUrls.slice(0, 6).map((url, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded border bg-muted overflow-hidden"
                  >
                    <img
                      src={url}
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ))}
                {listing.imageUrls.length > 6 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{listing.imageUrls.length - 6} more
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> No images
              </span>
            )}
          </DetailSection>

          {/* Warnings */}
          {listing.warnings.length > 0 && (
            <div className="rounded-md bg-yellow-500/10 p-2 space-y-1">
              {listing.warnings.map((w, i) => (
                <div key={i} className="text-xs text-yellow-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {w}
                </div>
              ))}
            </div>
          )}

          {/* Description Preview */}
          <DetailSection label="Description Preview">
            <div
              className="mt-1 p-2 rounded border bg-background text-xs max-h-32 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: listing.description }}
            />
          </DetailSection>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
