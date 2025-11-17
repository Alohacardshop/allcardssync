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
import { Search, Filter, ChevronDown, X } from 'lucide-react';
import { generatePrintJobsFromIntakeItems } from '@/lib/print/generateJobs';
import { getWorkstationId } from '@/lib/workstationId';
import { toast } from 'sonner';

export default function PulledItemsFilter() {
  const [items, setItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]); // Store all items for tag extraction
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIncludeTags, setSelectedIncludeTags] = useState<string[]>([]);
  const [selectedExcludeTags, setSelectedExcludeTags] = useState<string[]>(['printed']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | null>(null);

  useEffect(() => {
    fetchAllItems();
  }, []);

  useEffect(() => {
    filterItems();
    setSelectedItems(new Set()); // Clear selection when filters change
  }, [searchTerm, selectedIncludeTags, selectedExcludeTags, dateFilter, allItems]);

  const fetchAllItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .is('printed_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

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

  const handleGenerateJobs = async () => {
    if (selectedItems.size === 0) {
      toast.error('Please select at least one item');
      return;
    }

    setIsGenerating(true);
    try {
      // Filter items to only selected ones
      const selectedItemsList = items.filter(item => selectedItems.has(item.id));
      
      // Create print jobs for each selected item
      let created = 0;
      let skipped = 0;
      
      for (const item of selectedItemsList) {
        const result = await generatePrintJobsFromIntakeItems({
          workstationId: getWorkstationId(),
        });
        created += result.created;
        skipped += result.skipped;
      }

      if (created === 0) {
        toast.info(`No matching print profiles found for selected items`);
      } else {
        toast.success(`Created ${created} print jobs for ${selectedItems.size} selected items`);
        setSelectedItems(new Set()); // Clear selection after generating
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Pulled Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Button
              onClick={handleGenerateJobs}
              disabled={isGenerating || selectedItems.size === 0}
              size="sm"
            >
              {isGenerating ? 'Generating...' : `Generate Print Jobs (${selectedItems.size})`}
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
