import { useState, useEffect } from 'react';
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
import { Search, Filter, ChevronDown, X, Printer, Download, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { ShopifyPullDialog } from '@/components/barcode-printing/ShopifyPullDialog';
import { printQueue } from '@/lib/print/queueInstance';
import { zplFromTemplateString } from '@/lib/labels/zpl';

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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIncludeTags, setSelectedIncludeTags] = useState<string[]>([]);
  const [selectedExcludeTags, setSelectedExcludeTags] = useState<string[]>(['printed']);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | null>(null);

  // Store/Location filter state
  const [filterStore, setFilterStore] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [availableStores, setAvailableStores] = useState<string[]>([]);
  const [availableLocations, setAvailableLocations] = useState<{ gid: string; name: string }[]>([]);
  const [locationNameCache, setLocationNameCache] = useState<Record<string, string>>({});

  // Shopify pull state
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [pullSectionOpen, setPullSectionOpen] = useState(true);

  // Template state
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [copies, setCopies] = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchLocationNames();
  }, []);

  useEffect(() => {
    if (assignedStore) {
      fetchAllItems();
    } else {
      setAllItems([]);
      setItems([]);
      setLoading(false);
    }
  }, [assignedStore, selectedLocation]);

  useEffect(() => {
    filterItems();
    setSelectedItems(new Set());
  }, [searchTerm, selectedIncludeTags, selectedExcludeTags, dateFilter, filterStore, filterLocation, allItems]);

  // Update location names when cache is populated
  useEffect(() => {
    if (Object.keys(locationNameCache).length > 0 && allItems.length > 0) {
      const locationsMap = new Map<string, string>();
      allItems.forEach(item => {
        if (item.shopify_location_gid) {
          const locName = locationNameCache[item.shopify_location_gid] || item.shopify_location_gid;
          locationsMap.set(item.shopify_location_gid, locName);
        }
      });
      setAvailableLocations(
        Array.from(locationsMap.entries()).map(([gid, name]) => ({ gid, name }))
      );
    }
  }, [locationNameCache, allItems]);

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
        .is('printed_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Also filter by location if set
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAllItems(data || []);
      
      // Extract all unique tags
      const tagsSet = new Set<string>();
      const storesSet = new Set<string>();
      const locationsMap = new Map<string, string>();
      
      (data || []).forEach(item => {
        const itemTags = [
          ...((item.shopify_snapshot as any)?.tags || []),
          ...((item.source_payload as any)?.tags || []),
        ];
        itemTags.forEach((tag: string) => tagsSet.add(tag));
        
        // Collect stores
        if (item.store_key) {
          storesSet.add(item.store_key);
        }
        
        // Collect locations - use location name cache
        if (item.shopify_location_gid) {
          const locName = locationNameCache[item.shopify_location_gid] || item.shopify_location_gid;
          locationsMap.set(item.shopify_location_gid, locName);
        }
      });
      
      setAvailableTags(Array.from(tagsSet).sort());
      setAvailableStores(Array.from(storesSet).sort());
      setAvailableLocations(
        Array.from(locationsMap.entries()).map(([gid, name]) => ({ gid, name }))
      );
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

    // Store filter
    if (filterStore && filterStore !== 'all') {
      filtered = filtered.filter(item => item.store_key === filterStore);
    }

    // Location filter
    if (filterLocation && filterLocation !== 'all') {
      filtered = filtered.filter(item => item.shopify_location_gid === filterLocation);
    }

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

    // Tag filters
    if (selectedIncludeTags.length > 0 || selectedExcludeTags.length > 0) {
      filtered = filtered.filter(item => {
        const itemTags = [
          ...((item.shopify_snapshot as any)?.tags || []),
          ...((item.source_payload as any)?.tags || []),
        ].map((t: string) => t.toLowerCase());

        // Check exclude tags
        if (selectedExcludeTags.length > 0) {
          const hasExcluded = selectedExcludeTags.some(tag => 
            itemTags.some(itemTag => itemTag.includes(tag.toLowerCase()))
          );
          if (hasExcluded) return false;
        }

        // Check include tags
        if (selectedIncludeTags.length > 0) {
          const hasIncluded = selectedIncludeTags.some(tag => 
            itemTags.some(itemTag => itemTag.includes(tag.toLowerCase()))
          );
          if (!hasIncluded) return false;
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

  const getTags = (item: any): string[] => {
    return [
      ...((item.shopify_snapshot as any)?.tags || []),
      ...((item.source_payload as any)?.tags || []),
    ];
  };

  // Abbreviate grade/condition for labels
  const abbreviateGrade = (variant?: string): string => {
    if (!variant) return '';
    const map: Record<string, string> = {
      'Near Mint': 'NM',
      'Lightly Played': 'LP',
      'Moderately Played': 'MP',
      'Heavily Played': 'HP',
      'Damaged': 'DMG',
    };
    return map[variant] || variant;
  };

  const handlePrintSelected = async () => {
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }

    if (!selectedTemplateId) {
      toast.error('Please select a label template');
      return;
    }

    // Get template
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
    let printedCount = 0;
    const itemIds = Array.from(selectedItems);

    try {
      for (const itemId of itemIds) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;

        // Build variables for template
        const vars = {
          CARDNAME: item.subject || item.brand_title || '',
          SETNAME: item.category || '',
          CARDNUMBER: item.card_number || '',
          CONDITION: abbreviateGrade(item.variant),
          PRICE: item.price ? `$${Number(item.price).toFixed(2)}` : '',
          SKU: item.sku || '',
          BARCODE: item.sku || '',
          VENDOR: item.vendor || '',
          YEAR: item.year || '',
          CATEGORY: item.main_category || '',
        };

        // Generate ZPL
        const zpl = zplFromTemplateString(zplBody, vars);

        // Queue for printing
        await printQueue.enqueueSafe({ zpl, qty: copies, usePQ: true });
        printedCount++;
      }

      // Update printed_at timestamps
      const { error: updateError } = await supabase
        .from('intake_items')
        .update({ printed_at: new Date().toISOString() })
        .in('id', itemIds);

      if (updateError) {
        console.error('Failed to update printed_at:', updateError);
      }

      toast.success(`Queued ${printedCount} label${printedCount > 1 ? 's' : ''} for printing`);
      
      // Clear selection and refresh items
      setSelectedItems(new Set());
      fetchAllItems();
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print labels');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePullSuccess = () => {
    setShowPullDialog(false);
    fetchAllItems();
  };

  const canPull = assignedStore && selectedLocation;

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
                <Button
                  onClick={() => setShowPullDialog(true)}
                  disabled={!canPull}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Pull Products
                </Button>
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
            <Button variant="ghost" size="sm" onClick={fetchAllItems} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Store and Location Filters */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Store</Label>
              <Select value={filterStore} onValueChange={setFilterStore}>
                <SelectTrigger>
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {availableStores.map((store) => (
                    <SelectItem key={store} value={store}>
                      {store === 'hawaii' ? 'Hawaii' : store === 'las_vegas' ? 'Las Vegas' : store}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {availableLocations.map((loc) => (
                    <SelectItem key={loc.gid} value={loc.gid}>
                      {loc.name}
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

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : `Showing ${items.length} of ${allItems.length} item(s)`}
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
                  <div className="text-right">
                    <div className="font-medium">${item.price}</div>
                    <div className="text-sm text-muted-foreground">{item.variant}</div>
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
                <span className="text-sm text-muted-foreground">
                  {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
                </span>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedItems(new Set())}
                >
                  Clear
                </Button>
                <Button 
                  onClick={handlePrintSelected}
                  disabled={isPrinting || !selectedTemplateId}
                >
                  {isPrinting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  Print Selected ({selectedItems.size})
                </Button>
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
    </div>
  );
}
