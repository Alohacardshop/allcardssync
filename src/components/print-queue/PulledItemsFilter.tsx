import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, Filter, ChevronDown, X, Printer, Download, RefreshCw, Loader2, Eye, ExternalLink, Check, Package, RotateCcw, Copy, Wrench } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { BatchSelectorDialog } from '@/components/BatchSelectorDialog';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { ShopifyPullDialog } from '@/components/barcode-printing/ShopifyPullDialog';
import { ShopifySyncDetailsDialog } from '@/components/ShopifySyncDetailsDialog';
import { printQueue } from '@/lib/print/queueInstance';
import { zplFromTemplateString } from '@/lib/labels/zpl';
import { getLocationByStoreKey } from '@/config/locations';
import { PrinterStatusBadge } from './PrinterStatusBadge';
import { PrintProgressDialog, PrintProgressItem } from './PrintProgressDialog';
import { ActiveFiltersBar } from './ActiveFiltersBar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SavedTemplate {
  id: string;
  name: string;
  canvas: any;
  is_default: boolean;
}

export default function PulledItemsFilter() {
  const { assignedStore, selectedLocation } = useStore();
  
  // Items state
  const [items, setItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIncludeTags, setSelectedIncludeTags] = useState<string[]>([]);
  const [selectedExcludeTags, setSelectedExcludeTags] = useState<string[]>([]); // Removed default 'printed' - handled by showPrintedItems toggle
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw' | 'graded'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Location name cache for display
  const [locationNameCache, setLocationNameCache] = useState<Record<string, string>>({});

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

  useEffect(() => {
    fetchTemplates();
    fetchLocationNames();
  }, []);

  // Fetch available categories once on mount (for dropdown options)
  useEffect(() => {
    if (assignedStore) {
      fetchAvailableCategories();
    }
  }, [assignedStore, selectedLocation]);

  // Refetch items when server-side filters change
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
      
      // Set default template
      const defaultTemplate = data?.find(t => t.is_default) || data?.[0];
      if (defaultTemplate && !selectedTemplateId) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const fetchLocationNames = async () => {
    try {
      const { data, error } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name');

      if (error) throw error;

      const cache: Record<string, string> = {};
      (data || []).forEach(loc => {
        if (loc.location_gid && loc.location_name) {
          cache[loc.location_gid] = loc.location_name;
        }
      });
      setLocationNameCache(cache);
    } catch (error) {
      console.error('Failed to load location names:', error);
    }
  };

  // Fetch available categories for dropdown using efficient RPC function
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
      console.log('[fetchAvailableCategories] Found categories:', categories);
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
    
    // Log current filter state for debugging
    console.log('[fetchAllItems] Fetching with filters:', {
      assignedStore,
      selectedLocation,
      showPrintedItems,
      typeFilter,
      categoryFilter
    });
    
    try {
      let query = supabase
        .from('intake_items')
        .select('*')
        .eq('store_key', assignedStore)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Only filter for unprinted if toggle is OFF
      if (!showPrintedItems) {
        query = query.is('printed_at', null);
      }

      // Also filter by location if set
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      // SERVER-SIDE: Apply type filter at DB level to get all matching items
      if (typeFilter !== 'all') {
        query = query.ilike('type', typeFilter);
        console.log('[fetchAllItems] Applied type filter:', typeFilter);
      }

      // SERVER-SIDE: Apply category filter at DB level
      if (categoryFilter !== 'all') {
        // Use OR filter for main_category, category, or sub_category
        query = query.or(`main_category.ilike.${categoryFilter},category.ilike.${categoryFilter},sub_category.ilike.${categoryFilter}`);
        console.log('[fetchAllItems] Applied category filter:', categoryFilter);
      }

      // Apply explicit limit to prevent default 1000-row truncation
      const { data, error } = await query.limit(5000);
      
      console.log('[fetchAllItems] Query returned', data?.length || 0, 'items');

      // Get total count for display (in case there are more than 5000)
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
      
      // Extract all unique tags
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

    // NOTE: Store and location are now handled by global context (StoreContext)
    // Type and category filters are applied server-side in fetchAllItems
    // for better performance with large datasets (avoids 1000 row limit issues)

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.sku?.toLowerCase().includes(search) ||
        item.brand_title?.toLowerCase().includes(search) ||
        item.subject?.toLowerCase().includes(search)
      );
    }

    // Date filter
    if (dateFilter) {
      filtered = filtered.filter(item => {
        if (!item.pushed_at) return false;
        
        const pushedDate = new Date(item.pushed_at);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        switch (dateFilter) {
          case 'today':
            return pushedDate >= today;
          case 'yesterday':
            const tomorrowStart = new Date(today);
            tomorrowStart.setDate(tomorrowStart.getDate() + 1);
            return pushedDate >= yesterday && pushedDate < tomorrowStart;
          case '7days':
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return pushedDate >= sevenDaysAgo;
          case '30days':
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return pushedDate >= thirtyDaysAgo;
          default:
            return true;
        }
      });
    }

    // Tag filters - exact matching, AND logic for includes
    if (selectedIncludeTags.length > 0 || selectedExcludeTags.length > 0) {
      filtered = filtered.filter(item => {
        const itemTags = [
          ...((item.shopify_snapshot as any)?.tags || []),
          ...((item.source_payload as any)?.tags || []),
        ].filter(Boolean).map((t: string) => t.toLowerCase().trim());

        // Check exclude tags - exclude if ANY match exactly
        if (selectedExcludeTags.length > 0) {
          const hasExcluded = selectedExcludeTags.some(tag => 
            itemTags.includes(tag.toLowerCase().trim())
          );
          if (hasExcluded) return false;
        }

        // Check include tags - must have ALL selected tags (AND logic)
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

  // Build active filters list for display
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

  const getTags = (item: any): string[] => {
    return [
      ...((item.shopify_snapshot as any)?.tags || []),
      ...((item.source_payload as any)?.tags || []),
    ];
  };

  // Abbreviate grade/condition for labels
  const abbreviateGrade = (variant?: string): string => {
    if (!variant) return '';
    
    // Handle compound conditions like "Lightly Played - Foil"
    let result = variant;
    const conditionMap: [RegExp, string][] = [
      [/\bNear Mint\b/gi, 'NM'],
      [/\bLightly Played\b/gi, 'LP'],
      [/\bModerately Played\b/gi, 'MP'],
      [/\bHeavily Played\b/gi, 'HP'],
      [/\bDamaged\b/gi, 'DMG'],
      [/\bFoil\b/gi, 'F'],
      [/\bHolo\b/gi, 'H'],
      [/\bReverse Holo\b/gi, 'RH'],
      [/\bUnlimited\b/gi, 'UNL'],
      [/\b1st Edition\b/gi, '1E'],
    ];
    
    for (const [pattern, abbrev] of conditionMap) {
      result = result.replace(pattern, abbrev);
    }
    
    // Clean up separators
    result = result.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
    
    return result;
  };

  // Get the ZPL template body for reuse
  const getZplTemplate = useCallback(() => {
    const template = templates.find(t => t.id === selectedTemplateId);
    return template?.canvas?.zplLabel || null;
  }, [templates, selectedTemplateId]);

  // Print a single item - used by progress dialog
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
    
    // Update printed_at timestamps only if markAsPrinted is enabled
    if (markAsPrinted && results.success > 0) {
      const successIds = itemIds.slice(0, results.success);
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .in('id', successIds);

      if (updateError) {
        console.error('Failed to update printed_at:', updateError);
      }
    }

    const modeText = markAsPrinted ? '' : ' (test mode)';
    if (results.failed > 0) {
      toast.warning(`Printed ${results.success} labels, ${results.failed} failed${modeText}`);
    } else {
      toast.success(`Queued ${results.success} labels for printing${modeText}`);
    }
    
    // Clear selection and refresh items
    setSelectedItems(new Set());
    fetchAllItems();
  }, [markAsPrinted, printProgressItems, fetchAllItems]);

  const handlePrintCancel = useCallback(() => {
    setIsPrinting(false);
  }, []);

  const handlePrintSelected = async () => {
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

    // For small batches (≤5), print directly without progress dialog
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

  // Copy ZPL for first selected item to clipboard
  const handleCopyZpl = () => {
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

    // Get first selected item
    const firstItemId = Array.from(selectedItems)[0];
    const item = items.find(i => i.id === firstItemId);
    if (!item) {
      toast.error('Item not found');
      return;
    }

    // Build variables for template
    const vars = {
      CARDNAME: item.subject || item.brand_title || '',
      SETNAME: item.sub_category || '', // Use sub_category (e.g. "Pokemon") not category (e.g. "other")
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
    
    navigator.clipboard.writeText(zpl).then(() => {
      toast.success('ZPL copied! Paste into labelary.com/viewer.html to preview');
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  // Mark selected items as unprinted
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

  // Handle batch printing
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
      // Fetch items from selected batches
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
          SETNAME: item.sub_category || '', // Use sub_category not category
          CARDNUMBER: item.card_number || '',
          CONDITION: item.variant || '', // Full condition text, template handles wrapping
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

      // Update printed_at timestamps
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

      {/* Filter Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Items
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-printed"
                        checked={showPrintedItems}
                        onCheckedChange={setShowPrintedItems}
                      />
                      <Label htmlFor="show-printed" className="text-sm font-normal cursor-pointer">
                        Include Printed
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Items are marked as printed after printing.</p>
                    <p className="text-xs text-muted-foreground">Turn on to reprint labels.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="ghost" size="sm" onClick={fetchAllItems} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type and Category Filters - Store/Location are now global */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select value={typeFilter} onValueChange={(v: 'all' | 'raw' | 'graded') => setTypeFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="raw">Raw Only</SelectItem>
                  <SelectItem value="graded">Graded Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {availableCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="SKU, title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Include Tags (must have)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedIncludeTags.length > 0 
                      ? `${selectedIncludeTags.length} selected`
                      : 'Select tags...'}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                      <CommandEmpty>No tags found.</CommandEmpty>
                      <CommandGroup>
                        {availableTags.map((tag) => (
                          <CommandItem
                            key={tag}
                            onSelect={() => toggleIncludeTag(tag)}
                          >
                            <Checkbox
                              checked={selectedIncludeTags.includes(tag)}
                              className="mr-2"
                            />
                            {tag}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedIncludeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedIncludeTags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => toggleIncludeTag(tag)}
                    >
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Exclude Tags (must not have)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedExcludeTags.length > 0 
                      ? `${selectedExcludeTags.length} selected`
                      : 'Select tags...'}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                      <CommandEmpty>No tags found.</CommandEmpty>
                      <CommandGroup>
                        {availableTags.map((tag) => (
                          <CommandItem
                            key={tag}
                            onSelect={() => toggleExcludeTag(tag)}
                          >
                            <Checkbox
                              checked={selectedExcludeTags.includes(tag)}
                              className="mr-2"
                            />
                            {tag}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedExcludeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedExcludeTags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="destructive"
                      className="cursor-pointer"
                      onClick={() => toggleExcludeTag(tag)}
                    >
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Date Filters */}
          <div className="space-y-2">
            <Label>Date Added to Shopify</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={dateFilter === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(dateFilter === 'today' ? null : 'today')}
              >
                Today
              </Button>
              <Button
                variant={dateFilter === 'yesterday' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(dateFilter === 'yesterday' ? null : 'yesterday')}
              >
                Yesterday
              </Button>
              <Button
                variant={dateFilter === '7days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(dateFilter === '7days' ? null : '7days')}
              >
                Last 7 Days
              </Button>
              <Button
                variant={dateFilter === '30days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(dateFilter === '30days' ? null : '30days')}
              >
                Last 30 Days
              </Button>
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter(null)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Active Filters Summary */}
          <ActiveFiltersBar 
            filters={activeFilters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
          />

          {/* Results summary and Select All */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : (
                  <>
                    Showing {items.length} of {allItems.length} item(s)
                    {totalCount !== null && totalCount > allItems.length && (
                      <span className="text-amber-600 ml-1">
                        ({totalCount.toLocaleString()} total - showing first 5,000)
                      </span>
                    )}
                  </>
                )}
              </div>
              {items.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Select All {selectedItems.size > 0 && `(${selectedItems.size} selected)`}
                  </label>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <div className="grid gap-4">
        {items.map((item) => (
          <Card 
            key={item.id}
            className={selectedItems.has(item.id) ? 'ring-2 ring-primary' : ''}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                  className="mt-1"
                />
                <div className="flex-1 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{item.brand_title || item.subject}</div>
                    <div className="text-sm text-muted-foreground">
                      SKU: {item.sku} • {item.main_category}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {getTags(item).map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
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
                          setDetailItem(item);
                        }}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {getShopifyAdminUrl(item) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          title="View in Shopify"
                        >
                          <a
                            href={getShopifyAdminUrl(item)!}
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
        ))}
      </div>

      {/* Sticky Action Bar */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="template" className="text-xs">Template</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger id="template" className="w-[200px]">
                      <SelectValue placeholder="Select template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} {template.is_default && '(default)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="copies" className="text-xs">Copies</Label>
                  <Input
                    id="copies"
                    type="number"
                    min={1}
                    max={10}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PrinterStatusBadge />
                <span className="text-sm text-muted-foreground">
                  {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
                </span>
                <Button 
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItems(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
              
              {/* Primary Print Action */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handlePrintSelected}
                  disabled={isPrinting || !selectedTemplateId}
                  size="lg"
                >
                  {isPrinting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  Print Selected ({selectedItems.size})
                </Button>
                
                {/* Test Mode Controls - Popover based */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Wrench className="h-4 w-4" />
                      Test Mode
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-3" align="end" side="top">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="mark-printed-toggle" className="text-xs">Mark as printed</Label>
                        <Switch
                          id="mark-printed-toggle"
                          checked={markAsPrinted}
                          onCheckedChange={setMarkAsPrinted}
                        />
                      </div>
                      <Button 
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleCopyZpl}
                        disabled={!selectedTemplateId}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy ZPL
                      </Button>
                      {showPrintedItems && items.some(i => selectedItems.has(i.id) && i.printed_at) && (
                        <Button 
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={handleMarkAsUnprinted}
                          disabled={isMarkingUnprinted}
                        >
                          {isMarkingUnprinted ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                          )}
                          Mark Unprinted
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      )}

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
