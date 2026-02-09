import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Package, Search, ShoppingCart, RefreshCw, CheckCircle, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useEbayListing } from '@/hooks/useEbayListing';
import { EbayListingPreview } from '@/components/admin/EbayListingPreview';
import type { StoreConfig } from '@/lib/ebayPreviewResolver';

type InventoryItem = {
  id: string;
  sku: string | null;
  psa_cert: string | null;
  cgc_cert: string | null;
  brand_title: string | null;
  subject: string | null;
  main_category: string | null;
  price: number | null;
  grade: string | null;
  grading_company: string;
  year: string | null;
  card_number: string | null;
  variant: string | null;
  image_urls: any;
  list_on_ebay: boolean | null;
  list_on_shopify: boolean | null;
  ebay_listing_id: string | null;
  ebay_sync_status: string | null;
  shopify_sync_status: string | null;
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'pokemon', label: '🎴 Pokemon' },
  { value: 'magic', label: '🧙 Magic: The Gathering' },
  { value: 'yugioh', label: '🃏 Yu-Gi-Oh!' },
  { value: 'baseball', label: '⚾ Baseball' },
  { value: 'basketball', label: '🏀 Basketball' },
  { value: 'football', label: '🏈 Football' },
  { value: 'hockey', label: '🏒 Hockey' },
  { value: 'soccer', label: '⚽ Soccer' },
  { value: 'comics', label: '📚 Comics' },
];

interface EbayBulkListingProps {
  storeKey?: string;
  storeConfig?: StoreConfig | null;
}

export function EbayBulkListing({ storeKey, storeConfig }: EbayBulkListingProps) {
  const queryClient = useQueryClient();
  const { bulkToggleEbay, queueForEbaySync } = useEbayListing();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('not_listed');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isQueueing, setIsQueueing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ['ebay-bulk-listing-items', filterStatus, filterCategory, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('intake_items')
        .select('id, sku, psa_cert, cgc_cert, brand_title, subject, main_category, price, grade, grading_company, year, card_number, variant, image_urls, list_on_ebay, list_on_shopify, ebay_listing_id, ebay_sync_status, shopify_sync_status')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      // Filter by eBay listing status
      if (filterStatus === 'not_listed') {
        query = query.is('ebay_listing_id', null);
      } else if (filterStatus === 'listed') {
        query = query.not('ebay_listing_id', 'is', null);
      } else if (filterStatus === 'marked') {
        query = query.eq('list_on_ebay', true);
      } else if (filterStatus === 'not_marked') {
        query = query.or('list_on_ebay.is.null,list_on_ebay.eq.false');
      }

      // Filter by category
      if (filterCategory && filterCategory !== 'all') {
        query = query.or(`main_category.ilike.%${filterCategory}%,brand_title.ilike.%${filterCategory}%`);
      }

      // Search
      if (searchQuery) {
        query = query.or(`sku.ilike.%${searchQuery}%,psa_cert.ilike.%${searchQuery}%,brand_title.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  const toggleSelectAll = () => {
    if (!items) return;
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  const toggleItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  const handleMarkForEbay = async (enable: boolean) => {
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }
    await bulkToggleEbay(Array.from(selectedItems), enable);
    setSelectedItems(new Set());
    refetch();
  };

  const handleOpenPreview = () => {
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }
    const itemsToSync = items?.filter(i => selectedItems.has(i.id) && !i.ebay_listing_id) || [];
    if (itemsToSync.length === 0) {
      toast.error('No eligible items to sync (already listed or not selected)');
      return;
    }
    setPreviewOpen(true);
  };

  const handleConfirmQueue = async (itemIds: string[]) => {
    setIsQueueing(true);
    try {
      await queueForEbaySync(itemIds, storeKey || 'default');
      setSelectedItems(new Set());
      setPreviewOpen(false);
      refetch();
    } finally {
      setIsQueueing(false);
    }
  };

  const handleImportFromShopify = async () => {
    if (!storeKey) {
      toast.error('No store selected');
      return;
    }
    
    setIsImporting(true);
    setImportProgress({ current: 0, total: 100 });
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-import-inventory', {
        body: { store_key: storeKey, mode: 'sync' }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Import failed');

      toast.success(`Imported ${data.imported || 0} items from Shopify`);
      queryClient.invalidateQueries({ queryKey: ['ebay-bulk-listing-items'] });
      refetch();
    } catch (error: any) {
      toast.error('Import failed: ' + error.message);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const getItemTitle = (item: InventoryItem) => {
    if (item.brand_title && item.subject) {
      return `${item.brand_title} ${item.subject}`;
    }
    return item.sku || item.psa_cert || 'Unknown';
  };

  const getEbayStatus = (item: InventoryItem) => {
    if (item.ebay_listing_id) {
      return <Badge variant="default" className="bg-green-600">Listed</Badge>;
    }
    if (item.ebay_sync_status === 'queued') {
      return <Badge variant="secondary">Queued</Badge>;
    }
    if (item.ebay_sync_status === 'processing') {
      return <Badge variant="default">Processing</Badge>;
    }
    if (item.ebay_sync_status === 'error') {
      return <Badge variant="destructive">Error</Badge>;
    }
    if (item.list_on_ebay) {
      return <Badge variant="outline">Marked</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Not Listed</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Bulk eBay Listing
            </CardTitle>
            <CardDescription>Select items to list on eBay</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleImportFromShopify}
              disabled={isImporting || !storeKey}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import from Shopify
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, cert, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="not_listed">Not Listed on eBay</SelectItem>
              <SelectItem value="listed">Listed on eBay</SelectItem>
              <SelectItem value="marked">Marked for eBay</SelectItem>
              <SelectItem value="not_marked">Not Marked for eBay</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMarkForEbay(true)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark for eBay
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMarkForEbay(false)}
              >
                Unmark from eBay
              </Button>
              <Button
                size="sm"
                onClick={handleOpenPreview}
                disabled={isQueueing}
              >
                {isQueueing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-2" />
                )}
                Preview & Queue
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !items?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            No items found
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={items.length > 0 && selectedItems.size === items.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU / Cert</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>eBay Status</TableHead>
                  <TableHead>Shopify</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow 
                    key={item.id}
                    className={selectedItems.has(item.id) ? 'bg-muted/50' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[250px] truncate font-medium" title={getItemTitle(item)}>
                        {getItemTitle(item)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {item.sku && <div className="font-mono">{item.sku}</div>}
                        {item.psa_cert && (
                          <div className="text-muted-foreground text-xs">
                            PSA: {item.psa_cert}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.grade && (
                        <Badge variant="outline">{item.grade}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.price != null ? (
                        <span className="font-medium">${item.price.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getEbayStatus(item)}</TableCell>
                    <TableCell>
                      {item.list_on_shopify ? (
                        <Badge variant="outline" className="text-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {items && items.length >= 200 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing first 200 results. Use search to find specific items.
          </p>
        )}
      </CardContent>

      {/* Listing Preview Dialog */}
      {storeKey && storeConfig && (
        <EbayListingPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          items={items?.filter(i => selectedItems.has(i.id) && !i.ebay_listing_id) || []}
          storeKey={storeKey}
          storeConfig={storeConfig}
          onConfirm={handleConfirmQueue}
          isConfirming={isQueueing}
        />
      )}
    </Card>
  );
}
