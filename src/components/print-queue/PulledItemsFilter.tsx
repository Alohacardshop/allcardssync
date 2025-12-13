import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, ChevronDown, Package } from 'lucide-react';
import { BatchSelectorDialog } from '@/components/BatchSelectorDialog';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { ShopifyPullDialog } from '@/components/barcode-printing/ShopifyPullDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { printQueue } from '@/lib/print/queueInstance';
import { zplFromTemplateString } from '@/lib/labels/zpl';
import { getLocationByStoreKey } from '@/config/locations';
import { PrintProgressDialog, PrintProgressItem } from './PrintProgressDialog';
import { FilterPanel } from './FilterPanel';
import { ItemCard } from './ItemCard';
import { PrintActionBar } from './PrintActionBar';
import { PrintConfirmDialog } from './PrintConfirmDialog';
import { LimitWarningBanner } from './LimitWarningBanner';

interface SavedTemplate {
  id: string;
  name: string;
  canvas: any;
  is_default: boolean;
}

type DateFilterType = 'today' | 'yesterday' | '7days' | '30days' | null;
type TypeFilterType = 'all' | 'raw' | 'graded';

const LARGE_PRINT_THRESHOLD = 50;
const QUERY_LIMIT = 5000;

export default function PulledItemsFilter() {
  const { assignedStore, selectedLocation } = useStore();
  
  // Items state
  const [items, setItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIncludeTags, setSelectedIncludeTags] = useState<string[]>([]);
  const [selectedExcludeTags, setSelectedExcludeTags] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilterType>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Shopify pull state
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [pullSectionOpen, setPullSectionOpen] = useState(true);

  // Template state
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [copies, setCopies] = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  // Detail dialog state
  const [detailItem, setDetailItem] = useState<any | null>(null);

  // Show printed items toggle
  const [showPrintedItems, setShowPrintedItems] = useState(false);

  // Batch selector dialog
  const [showBatchSelector, setShowBatchSelector] = useState(false);

  // Mark as unprinted loading state
  const [isMarkingUnprinted, setIsMarkingUnprinted] = useState(false);

  // Testing mode - don't mark as printed when disabled
  const [markAsPrinted, setMarkAsPrinted] = useState(false);

  // Print progress dialog state
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [printProgressItems, setPrintProgressItems] = useState<PrintProgressItem[]>([]);

  // Large print confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (assignedStore) {
      fetchAvailableCategories();
    }
  }, [assignedStore, selectedLocation]);

  useEffect(() => {
    if (assignedStore) {
      fetchAllItems();
    } else {
      setAllItems([]);
      setItems([]);
      setLoading(false);
    }
  }, [assignedStore, selectedLocation, showPrintedItems, typeFilter, categoryFilter]);

  useEffect(() => {
    filterItems();
    setSelectedItems(new Set());
  }, [searchTerm, selectedIncludeTags, selectedExcludeTags, dateFilter, allItems]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('*')
        .eq('template_type', 'raw')
        .order('is_default', { ascending: false });

      if (error) throw error;

      setTemplates(data || []);
      
      const defaultTemplate = data?.find(t => t.is_default) || data?.[0];
      if (defaultTemplate && !selectedTemplateId) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const fetchAvailableCategories = async () => {
    if (!assignedStore) return;
    
    try {
      const { data, error } = await supabase.rpc('get_distinct_categories', {
        store_key_in: assignedStore,
        location_gid_in: selectedLocation || null
      });

      if (error) throw error;

      const categories = ((data as { category_value: string }[] | null) || [])
        .map((row) => row.category_value)
        .filter(Boolean);
      
      setAvailableCategories(categories);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchAllItems = async () => {
    if (!assignedStore) {
      setAllItems([]);
      setItems([]);
      return;
    }

    setLoading(true);
    
    try {
      let query = supabase
        .from('intake_items')
        .select('*')
        .eq('store_key', assignedStore)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!showPrintedItems) {
        query = query.is('printed_at', null);
      }

      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      if (typeFilter !== 'all') {
        query = query.ilike('type', typeFilter);
      }

      if (categoryFilter !== 'all') {
        query = query.or(`main_category.ilike.${categoryFilter},category.ilike.${categoryFilter},sub_category.ilike.${categoryFilter}`);
      }

      const { data, error } = await query.limit(QUERY_LIMIT);

      // Get total count
      let countQuery = supabase
        .from('intake_items')
        .select('*', { count: 'exact', head: true })
        .eq('store_key', assignedStore)
        .is('deleted_at', null);

      if (!showPrintedItems) {
        countQuery = countQuery.is('printed_at', null);
      }
      if (selectedLocation) {
        countQuery = countQuery.eq('shopify_location_gid', selectedLocation);
      }
      if (typeFilter !== 'all') {
        countQuery = countQuery.ilike('type', typeFilter);
      }
      if (categoryFilter !== 'all') {
        countQuery = countQuery.or(`main_category.ilike.${categoryFilter},category.ilike.${categoryFilter},sub_category.ilike.${categoryFilter}`);
      }

      const { count } = await countQuery;
      setTotalCount(count);

      if (error) throw error;

      setAllItems(data || []);
      
      // Extract unique tags
      const tagsSet = new Set<string>();
      (data || []).forEach(item => {
        const itemTags = [
          ...((item.shopify_snapshot as any)?.tags || []),
          ...((item.source_payload as any)?.tags || []),
        ];
        itemTags.forEach((tag: string) => tagsSet.add(tag));
      });
      
      setAvailableTags(Array.from(tagsSet).sort());
      filterItems();
    } catch (error) {
      console.error('Failed to fetch items:', error);
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...allItems];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.sku?.toLowerCase().includes(search) ||
        item.brand_title?.toLowerCase().includes(search) ||
        item.subject?.toLowerCase().includes(search)
      );
    }

    if (dateFilter) {
      filtered = filtered.filter(item => {
        if (!item.created_at) return false;
        
        const createdDate = new Date(item.created_at);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        switch (dateFilter) {
          case 'today':
            return createdDate >= today;
          case 'yesterday':
            const tomorrowStart = new Date(today);
            tomorrowStart.setDate(tomorrowStart.getDate() + 1);
            return createdDate >= yesterday && createdDate < tomorrowStart;
          case '7days':
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return createdDate >= sevenDaysAgo;
          case '30days':
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return createdDate >= thirtyDaysAgo;
          default:
            return true;
        }
      });
    }

    if (selectedIncludeTags.length > 0 || selectedExcludeTags.length > 0) {
      filtered = filtered.filter(item => {
        const itemTags = [
          ...((item.shopify_snapshot as any)?.tags || []),
          ...((item.source_payload as any)?.tags || []),
        ].filter(Boolean).map((t: string) => t.toLowerCase().trim());

        if (selectedExcludeTags.length > 0) {
          const hasExcluded = selectedExcludeTags.some(tag => 
            itemTags.includes(tag.toLowerCase().trim())
          );
          if (hasExcluded) return false;
        }

        if (selectedIncludeTags.length > 0) {
          const hasAllIncluded = selectedIncludeTags.every(tag => 
            itemTags.includes(tag.toLowerCase().trim())
          );
          if (!hasAllIncluded) return false;
        }

        return true;
      });
    }

    setItems(filtered);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(items.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const isAllSelected = items.length > 0 && selectedItems.size === items.length;
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < items.length;

  const toggleIncludeTag = (tag: string) => {
    setSelectedIncludeTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleExcludeTag = (tag: string) => {
    setSelectedExcludeTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Build active filters list
  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; value: string; displayValue: string }> = [];
    
    if (typeFilter !== 'all') {
      filters.push({
        key: 'type',
        label: 'Type',
        value: typeFilter,
        displayValue: typeFilter === 'raw' ? 'Raw' : 'Graded'
      });
    }
    
    if (categoryFilter !== 'all') {
      filters.push({
        key: 'category',
        label: 'Category',
        value: categoryFilter,
        displayValue: categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1)
      });
    }
    
    if (searchTerm) {
      filters.push({
        key: 'search',
        label: 'Search',
        value: searchTerm,
        displayValue: `"${searchTerm}"`
      });
    }
    
    if (dateFilter) {
      const dateLabels: Record<string, string> = {
        today: 'Today',
        yesterday: 'Yesterday',
        '7days': 'Last 7 Days',
        '30days': 'Last 30 Days'
      };
      filters.push({
        key: 'date',
        label: 'Date',
        value: dateFilter,
        displayValue: dateLabels[dateFilter]
      });
    }
    
    selectedIncludeTags.forEach(tag => {
      filters.push({
        key: 'includeTag',
        label: 'Include',
        value: tag,
        displayValue: tag
      });
    });
    
    selectedExcludeTags.forEach(tag => {
      filters.push({
        key: 'excludeTag',
        label: 'Exclude',
        value: tag,
        displayValue: tag
      });
    });
    
    return filters;
  }, [typeFilter, categoryFilter, searchTerm, dateFilter, selectedIncludeTags, selectedExcludeTags]);

  const handleRemoveFilter = (key: string, value?: string) => {
    switch (key) {
      case 'type':
        setTypeFilter('all');
        break;
      case 'category':
        setCategoryFilter('all');
        break;
      case 'search':
        setSearchTerm('');
        break;
      case 'date':
        setDateFilter(null);
        break;
      case 'includeTag':
        if (value) setSelectedIncludeTags(prev => prev.filter(t => t !== value));
        break;
      case 'excludeTag':
        if (value) setSelectedExcludeTags(prev => prev.filter(t => t !== value));
        break;
    }
  };

  const handleClearAllFilters = () => {
    setTypeFilter('all');
    setCategoryFilter('all');
    setSearchTerm('');
    setDateFilter(null);
    setSelectedIncludeTags([]);
    setSelectedExcludeTags([]);
  };

  // Get the ZPL template body
  const getZplTemplate = useCallback(() => {
    const template = templates.find(t => t.id === selectedTemplateId);
    return template?.canvas?.zplLabel || null;
  }, [templates, selectedTemplateId]);

  // Print a single item
  const handlePrintSingleItem = useCallback(async (progressItem: PrintProgressItem): Promise<boolean> => {
    const item = items.find(i => i.id === progressItem.id);
    if (!item) return false;

    const zplBody = getZplTemplate();
    if (!zplBody) return false;

    try {
      const vars = {
        CARDNAME: item.subject || item.brand_title || '',
        SETNAME: item.sub_category || '',
        CARDNUMBER: item.card_number || '',
        CONDITION: item.variant || '',
        PRICE: item.price ? `$${Number(item.price).toFixed(2)}` : '',
        SKU: item.sku || '',
        BARCODE: item.sku || '',
        VENDOR: item.vendor || '',
        YEAR: item.year || '',
        CATEGORY: item.main_category || '',
      };

      const zpl = zplFromTemplateString(zplBody, vars);
      await printQueue.enqueueSafe({ zpl, qty: copies, usePQ: true });
      return true;
    } catch (error) {
      console.error('Print single item error:', error);
      return false;
    }
  }, [items, getZplTemplate, copies]);

  // Handle completion from progress dialog
  const handlePrintComplete = useCallback(async (results: { success: number; failed: number }) => {
    const itemIds = printProgressItems.map(i => i.id);
    
    if (markAsPrinted && results.success > 0) {
      const successIds = itemIds.slice(0, results.success);
      await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .in('id', successIds);
    }

    const modeText = markAsPrinted ? '' : ' (test mode)';
    if (results.failed > 0) {
      toast.warning(`Printed ${results.success} labels, ${results.failed} failed${modeText}`);
    } else {
      toast.success(`Queued ${results.success} labels for printing${modeText}`);
    }
    
    setSelectedItems(new Set());
    fetchAllItems();
  }, [markAsPrinted, printProgressItems, fetchAllItems]);

  const handlePrintCancel = useCallback(() => {
    setIsPrinting(false);
  }, []);

  // Initiate print - check if confirmation needed
  const handlePrintClick = () => {
    if (selectedItems.size >= LARGE_PRINT_THRESHOLD) {
      setShowConfirmDialog(true);
    } else {
      executePrint();
    }
  };

  // Execute the actual print
  const executePrint = async () => {
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }

    if (!selectedTemplateId) {
      toast.error('Please select a label template');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) {
      toast.error('Template not found');
      return;
    }

    const zplBody = template.canvas?.zplLabel;
    if (!zplBody) {
      toast.error('Template has no ZPL body');
      return;
    }

    // For small batches (≤5), print directly
    if (selectedItems.size <= 5) {
      setIsPrinting(true);
      let printedCount = 0;
      const itemIds = Array.from(selectedItems);

      try {
        for (const itemId of itemIds) {
          const item = items.find(i => i.id === itemId);
          if (!item) continue;

          const vars = {
            CARDNAME: item.subject || item.brand_title || '',
            SETNAME: item.sub_category || '',
            CARDNUMBER: item.card_number || '',
            CONDITION: item.variant || '',
            PRICE: item.price ? `$${Number(item.price).toFixed(2)}` : '',
            SKU: item.sku || '',
            BARCODE: item.sku || '',
            VENDOR: item.vendor || '',
            YEAR: item.year || '',
            CATEGORY: item.main_category || '',
          };

          const zpl = zplFromTemplateString(zplBody, vars);
          await printQueue.enqueueSafe({ zpl, qty: copies, usePQ: true });
          printedCount++;
        }

        if (markAsPrinted) {
          await supabase
            .from('intake_items')
            .update({ printed_at: new Date().toISOString() })
            .in('id', itemIds);
        }

        toast.success(`Queued ${printedCount} label${printedCount > 1 ? 's' : ''} for printing${!markAsPrinted ? ' (test mode)' : ''}`);
        setSelectedItems(new Set());
        fetchAllItems();
      } catch (error) {
        console.error('Print error:', error);
        toast.error('Failed to print labels');
      } finally {
        setIsPrinting(false);
      }
      return;
    }

    // For larger batches, use progress dialog
    const progressItems: PrintProgressItem[] = Array.from(selectedItems).map(itemId => {
      const item = items.find(i => i.id === itemId);
      return {
        id: itemId,
        label: item?.subject || item?.brand_title || 'Unknown',
        sku: item?.sku,
      };
    });

    setPrintProgressItems(progressItems);
    setIsPrinting(true);
    setShowProgressDialog(true);
  };

  const handlePullSuccess = () => {
    setShowPullDialog(false);
    fetchAllItems();
  };

  const handleMarkAsUnprinted = async () => {
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }

    setIsMarkingUnprinted(true);
    try {
      const itemIds = Array.from(selectedItems);
      const { error } = await supabase
        .from('intake_items')
        .update({ printed_at: null })
        .in('id', itemIds);

      if (error) throw error;

      toast.success(`Marked ${itemIds.length} item${itemIds.length > 1 ? 's' : ''} as unprinted`);
      setSelectedItems(new Set());
      fetchAllItems();
    } catch (error) {
      console.error('Failed to mark as unprinted:', error);
      toast.error('Failed to mark items as unprinted');
    } finally {
      setIsMarkingUnprinted(false);
    }
  };

  const handlePrintBatches = async (batchIds: string[], includeAlreadyPrinted: boolean) => {
    if (!selectedTemplateId) {
      toast.error('Please select a label template first');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) {
      toast.error('Template not found');
      return;
    }

    const zplBody = template.canvas?.zplLabel;
    if (!zplBody) {
      toast.error('Template has no ZPL body');
      return;
    }

    setIsPrinting(true);
    try {
      let query = supabase
        .from('intake_items')
        .select('*')
        .in('lot_id', batchIds)
        .is('deleted_at', null);

      if (!includeAlreadyPrinted) {
        query = query.is('printed_at', null);
      }

      const { data: batchItems, error } = await query;

      if (error) throw error;

      if (!batchItems || batchItems.length === 0) {
        toast.info('No items to print in selected batches');
        return;
      }

      let printedCount = 0;
      const itemIds: string[] = [];

      for (const item of batchItems) {
        const vars = {
          CARDNAME: item.subject || item.brand_title || '',
          SETNAME: item.sub_category || '',
          CARDNUMBER: item.card_number || '',
          CONDITION: item.variant || '',
          PRICE: item.price ? `$${Number(item.price).toFixed(2)}` : '',
          SKU: item.sku || '',
          BARCODE: item.sku || '',
          VENDOR: item.vendor || '',
          YEAR: item.year || '',
          CATEGORY: item.main_category || '',
        };

        const zpl = zplFromTemplateString(zplBody, vars);
        await printQueue.enqueueSafe({ zpl, qty: copies, usePQ: true });
        printedCount++;
        itemIds.push(item.id);
      }

      if (itemIds.length > 0) {
        await supabase
          .from('intake_items')
          .update({ printed_at: new Date().toISOString() })
          .in('id', itemIds);
      }

      toast.success(`Queued ${printedCount} label${printedCount > 1 ? 's' : ''} from ${batchIds.length} batch${batchIds.length > 1 ? 'es' : ''}`);
      fetchAllItems();
    } catch (error) {
      console.error('Batch print error:', error);
      toast.error('Failed to print batch labels');
    } finally {
      setIsPrinting(false);
    }
  };

  const canPull = assignedStore && selectedLocation;

  const getShopifyAdminUrl = (item: any) => {
    if (!item.shopify_product_id || !item.store_key) return null;
    const config = getLocationByStoreKey(item.store_key);
    if (!config) return null;
    const storeSlug = config.shopDomain.replace('.myshopify.com', '');
    return `https://admin.shopify.com/store/${storeSlug}/products/${item.shopify_product_id}`;
  };

  const showMarkUnprintedButton = showPrintedItems && items.some(i => selectedItems.has(i.id) && i.printed_at);

  return (
    <div className="space-y-4 pb-24">
      {/* Pull from Shopify Section */}
      <Collapsible open={pullSectionOpen} onOpenChange={setPullSectionOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Pull from Shopify
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${pullSectionOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {canPull 
                    ? 'Pull products from your Shopify store to print labels.'
                    : 'Select a store and location in the top bar to pull products.'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowBatchSelector(true)}
                    disabled={!canPull}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Print by Batch
                  </Button>
                  <Button
                    onClick={() => setShowPullDialog(true)}
                    disabled={!canPull}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Pull Products
                  </Button>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Limit Warning Banner */}
      {totalCount !== null && (
        <LimitWarningBanner 
          displayedCount={allItems.length} 
          totalCount={totalCount} 
          limit={QUERY_LIMIT}
        />
      )}

      {/* Filter Section - Extracted Component */}
      <FilterPanel
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        availableCategories={availableCategories}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedIncludeTags={selectedIncludeTags}
        onToggleIncludeTag={toggleIncludeTag}
        selectedExcludeTags={selectedExcludeTags}
        onToggleExcludeTag={toggleExcludeTag}
        availableTags={availableTags}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        showPrintedItems={showPrintedItems}
        onShowPrintedItemsChange={setShowPrintedItems}
        activeFilters={activeFilters}
        onRemoveFilter={handleRemoveFilter}
        onClearAllFilters={handleClearAllFilters}
        loading={loading}
        onRefresh={fetchAllItems}
        filteredCount={items.length}
        totalCount={allItems.length}
        isAllSelected={isAllSelected}
        isSomeSelected={isSomeSelected}
        selectedCount={selectedItems.size}
        onSelectAll={handleSelectAll}
      />

      {/* Items List - Using Extracted ItemCard Component */}
      <div className="grid gap-4">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isSelected={selectedItems.has(item.id)}
            onSelect={(checked) => handleSelectItem(item.id, checked)}
            onViewDetails={() => setDetailItem(item)}
            getShopifyAdminUrl={getShopifyAdminUrl}
          />
        ))}
      </div>

      {/* Sticky Action Bar - Extracted Component */}
      <PrintActionBar
        selectedCount={selectedItems.size}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        copies={copies}
        onCopiesChange={setCopies}
        isPrinting={isPrinting}
        onPrint={handlePrintClick}
        onClearSelection={() => setSelectedItems(new Set())}
        markAsPrinted={markAsPrinted}
        onMarkAsPrintedChange={setMarkAsPrinted}
        showMarkUnprinted={showMarkUnprintedButton}
        isMarkingUnprinted={isMarkingUnprinted}
        onMarkUnprinted={handleMarkAsUnprinted}
      />

      {/* Large Print Confirmation Dialog */}
      <PrintConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        itemCount={selectedItems.size}
        copies={copies}
        onConfirm={() => {
          setShowConfirmDialog(false);
          executePrint();
        }}
      />

      {/* Shopify Pull Dialog */}
      {assignedStore && selectedLocation && (
        <ShopifyPullDialog
          open={showPullDialog}
          onOpenChange={setShowPullDialog}
          storeKey={assignedStore}
          locationGid={selectedLocation}
          onSuccess={handlePullSuccess}
        />
      )}

      {/* Item Detail Dialog */}
      {detailItem && (
        <ShopifySyncDetailsDialog
          open={!!detailItem}
          onOpenChange={(open) => !open && setDetailItem(null)}
          row={detailItem}
          selectedStoreKey={assignedStore}
          selectedLocationGid={selectedLocation}
          onRefresh={fetchAllItems}
        />
      )}

      {/* Batch Selector Dialog */}
      {assignedStore && selectedLocation && (
        <BatchSelectorDialog
          open={showBatchSelector}
          onOpenChange={setShowBatchSelector}
          storeKey={assignedStore}
          locationGid={selectedLocation}
          onPrintBatches={handlePrintBatches}
        />
      )}

      {/* Print Progress Dialog */}
      <PrintProgressDialog
        open={showProgressDialog}
        onOpenChange={(open) => {
          setShowProgressDialog(open);
          if (!open) setIsPrinting(false);
        }}
        items={printProgressItems}
        onPrintItem={handlePrintSingleItem}
        onComplete={handlePrintComplete}
        onCancel={handlePrintCancel}
      />
    </div>
  );
}
