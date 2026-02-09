import * as React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Globe, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface EbayCategorySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  filterType?: string;
}

interface LocalCategory {
  id: string;
  name: string;
  item_type: string | null;
  is_active: boolean;
  sort_order: number;
}

interface EbayRemoteCategory {
  id: string;
  name: string;
  full_path: string;
  parent_id: string | null;
}

export function EbayCategorySelect({
  value,
  onValueChange,
  placeholder = 'Search or select eBay category...',
  disabled,
  filterType,
}: EbayCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [ebayResults, setEbayResults] = useState<EbayRemoteCategory[]>([]);
  const [ebaySearching, setEbaySearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { assignedStore } = useStore();
  const storeKey = assignedStore || '';

  // Load local categories
  const { data: localCategories, isLoading } = useQuery({
    queryKey: ['ebay-categories', filterType],
    queryFn: async () => {
      let query = supabase
        .from('ebay_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (filterType) {
        query = query.eq('item_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LocalCategory[];
    },
  });

  // Find selected category name for display
  const selectedCategoryName = React.useMemo(() => {
    if (!value) return '';
    const local = localCategories?.find((c) => c.id === value);
    if (local) return `${local.name} (${local.id})`;
    const remote = ebayResults.find((c) => c.id === value);
    if (remote) return `${remote.name} (${remote.id})`;
    return value; // fallback to raw ID
  }, [value, localCategories, ebayResults]);

  // Debounced eBay search
  const searchEbay = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!query || query.length < 2 || !storeKey) {
        setEbayResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setEbaySearching(true);
        try {
          const { data, error } = await supabase.functions.invoke('ebay-fetch-categories', {
            body: { store_key: storeKey, query },
          });
          if (error) throw error;
          setEbayResults(data.categories || []);
        } catch (err: any) {
          console.error('eBay category search failed:', err);
          // Don't toast on every keystroke – just silently fail
        } finally {
          setEbaySearching(false);
        }
      }, 500);
    },
    [storeKey],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSearchChange(val: string) {
    setSearchValue(val);
    searchEbay(val);
  }

  // Select a local category
  function selectLocal(catId: string) {
    onValueChange(catId);
    setOpen(false);
    setSearchValue('');
  }

  // Select an eBay remote category – auto-import it to local DB then select
  async function selectRemote(cat: EbayRemoteCategory) {
    try {
      // Upsert into local table
      const { error } = await supabase.from('ebay_categories').upsert(
        {
          id: cat.id,
          name: cat.name,
          parent_id: cat.parent_id || null,
          item_type: 'other',
          is_active: true,
          sort_order: (localCategories?.length ?? 0) + 1,
        },
        { onConflict: 'id' },
      );
      if (error) throw error;

      // Invalidate cache so it shows up next time
      queryClient.invalidateQueries({ queryKey: ['ebay-categories'] });
      queryClient.invalidateQueries({ queryKey: ['ebay-categories-admin'] });

      toast.success(`Imported "${cat.name}" (${cat.id})`);
      onValueChange(cat.id);
    } catch (err: any) {
      toast.error('Failed to import category: ' + err.message);
    }
    setOpen(false);
    setSearchValue('');
  }

  // Which eBay results are NOT already in local list?
  const localIds = new Set(localCategories?.map((c) => c.id) || []);
  const newEbayResults = ebayResults.filter((c) => !localIds.has(c.id));

  // Filter local categories by search
  const filteredLocal = (localCategories || []).filter((cat) => {
    if (!searchValue) return true;
    const q = searchValue.toLowerCase();
    return cat.name.toLowerCase().includes(q) || cat.id.includes(q);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled || isLoading}
        >
          <span className="truncate">
            {isLoading ? 'Loading...' : selectedCategoryName || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search local + eBay..."
            value={searchValue}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            {/* Local categories */}
            {filteredLocal.length > 0 && (
              <CommandGroup heading="Your Categories">
                {filteredLocal.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.id}
                    onSelect={() => selectLocal(cat.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        value === cat.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Database className="mr-2 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{cat.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground font-mono">{cat.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* eBay live results */}
            {(newEbayResults.length > 0 || ebaySearching) && (
              <>
                {filteredLocal.length > 0 && <CommandSeparator />}
                <CommandGroup heading={ebaySearching ? 'Searching eBay...' : 'From eBay (click to import & select)'}>
                  {ebaySearching && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {newEbayResults.map((cat) => (
                    <CommandItem
                      key={`ebay-${cat.id}`}
                      value={`ebay-${cat.id}`}
                      onSelect={() => selectRemote(cat)}
                    >
                      <div className="mr-2 w-4" />
                      <Globe className="mr-2 h-3 w-3 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{cat.name}</span>
                        {cat.full_path && cat.full_path !== cat.name && (
                          <p className="text-xs text-muted-foreground truncate">{cat.full_path}</p>
                        )}
                      </div>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{cat.id}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Empty state */}
            {filteredLocal.length === 0 && newEbayResults.length === 0 && !ebaySearching && (
              <CommandEmpty>
                {searchValue.length < 2
                  ? 'Type at least 2 characters to search eBay'
                  : 'No categories found'}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
