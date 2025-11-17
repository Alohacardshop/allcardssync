import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Filter } from 'lucide-react';
import { generatePrintJobsFromIntakeItems } from '@/lib/print/generateJobs';
import { getWorkstationId } from '@/lib/workstationId';
import { toast } from 'sonner';

export default function PulledItemsFilter() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [includeTags, setIncludeTags] = useState('');
  const [excludeTags, setExcludeTags] = useState('printed');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchItems();
    setSelectedItems(new Set()); // Clear selection when filters change
  }, [searchTerm, includeTags, excludeTags]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('intake_items')
        .select('*')
        .is('printed_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (searchTerm) {
        query = query.or(`sku.ilike.%${searchTerm}%,brand_title.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by tags in memory (since tags are stored in JSON fields)
      let filtered = data || [];

      if (includeTags || excludeTags) {
        filtered = filtered.filter(item => {
          const itemTags = [
            ...((item.shopify_snapshot as any)?.tags || []),
            ...((item.source_payload as any)?.tags || []),
          ].map((t: string) => t.toLowerCase());

          // Check exclude tags
          if (excludeTags) {
            const exclude = excludeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            const hasExcluded = exclude.some(tag => 
              itemTags.some(itemTag => itemTag.includes(tag))
            );
            if (hasExcluded) return false;
          }

          // Check include tags
          if (includeTags) {
            const include = includeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            const hasIncluded = include.some(tag => 
              itemTags.some(itemTag => itemTag.includes(tag))
            );
            if (!hasIncluded) return false;
          }

          return true;
        });
      }

      setItems(filtered);
    } catch (error) {
      console.error('Failed to fetch items:', error);
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
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
          <div className="grid gap-4 md:grid-cols-3">
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
              <Label htmlFor="include-tags">Include Tags</Label>
              <Input
                id="include-tags"
                placeholder="sports, tcg"
                value={includeTags}
                onChange={(e) => setIncludeTags(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclude-tags">Exclude Tags</Label>
              <Input
                id="exclude-tags"
                placeholder="printed"
                value={excludeTags}
                onChange={(e) => setExcludeTags(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : `${items.length} items found`}
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
