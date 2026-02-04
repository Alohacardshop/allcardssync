/**
 * Left panel - items list with filters, search, and selection
 */

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, Trash2, Loader2, Search } from 'lucide-react';
import { E2EItemRow } from './E2EItemRow';
import type { TestItemWithStatus, TestItemStatus } from '@/hooks/useE2ETest';
import { useDebounce } from '@/hooks/useDebounce';

type TypeFilter = 'all' | 'graded' | 'raw';
type StatusFilter = 'all' | 'created' | 'synced' | 'failed';

interface E2EItemsPanelProps {
  testItems: TestItemWithStatus[];
  selectedItems: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onGenerateItems: (count: number, options?: { gradedOnly?: boolean; rawOnly?: boolean }) => void;
  onReload: () => void;
  onDeleteSelected: (ids: string[]) => void;
  onCleanupAll: () => void;
  isGenerating: boolean;
  isCleaningUp: boolean;
}

export function E2EItemsPanel({
  testItems,
  selectedItems,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onGenerateItems,
  onReload,
  onDeleteSelected,
  onCleanupAll,
  isGenerating,
  isCleaningUp
}: E2EItemsPanelProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  const debouncedSearch = useDebounce(search, 200);

  // Filter items
  const filteredItems = useMemo(() => {
    return testItems.filter(item => {
      // Search filter
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSku = item.sku?.toLowerCase().includes(searchLower);
        const matchesTitle = item.brand_title?.toLowerCase().includes(searchLower);
        const matchesSubject = item.subject?.toLowerCase().includes(searchLower);
        const matchesCert = item.psa_cert?.includes(debouncedSearch) || item.cgc_cert?.includes(debouncedSearch);
        if (!matchesSku && !matchesTitle && !matchesSubject && !matchesCert) return false;
      }

      // Type filter
      if (typeFilter !== 'all') {
        const isGraded = item.type === 'Graded';
        if (typeFilter === 'graded' && !isGraded) return false;
        if (typeFilter === 'raw' && isGraded) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const failedStatuses: TestItemStatus[] = ['shopify_failed', 'ebay_failed'];
        const syncedStatuses: TestItemStatus[] = ['shopify_synced', 'ebay_synced', 'printed'];
        
        if (statusFilter === 'failed' && !failedStatuses.includes(item.status)) return false;
        if (statusFilter === 'synced' && !syncedStatuses.includes(item.status)) return false;
        if (statusFilter === 'created' && item.status !== 'created') return false;
      }

      return true;
    });
  }, [testItems, debouncedSearch, typeFilter, statusFilter]);

  const selectedCount = selectedItems.size;
  const selectedIds = Array.from(selectedItems);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Test Items</h2>
          <Badge variant="secondary">{testItems.length} total</Badge>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, title, cert..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="graded">Graded</SelectItem>
              <SelectItem value="raw">Raw</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="created">New</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Selection controls */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedCount} of {filteredItems.length} selected
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onSelectAll} className="h-7 text-xs">
              Select All
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection} className="h-7 text-xs">
              Clear
            </Button>
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onDeleteSelected(selectedIds);
                  onClearSelection();
                }}
                disabled={isCleaningUp}
                className="h-7 text-xs"
              >
                {isCleaningUp ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1" />
                )}
                Delete ({selectedCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Items list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {testItems.length === 0 
                ? 'No test items. Generate some below.'
                : 'No items match your filters.'}
            </div>
          ) : (
            filteredItems.map(item => (
              <E2EItemRow
                key={item.id}
                item={item}
                isSelected={selectedItems.has(item.id)}
                onToggle={() => onToggleSelection(item.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer - Generate & Cleanup */}
      <div className="p-4 border-t space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-14">Graded:</span>
            <Button size="sm" variant="outline" onClick={() => onGenerateItems(1, { gradedOnly: true })} disabled={isGenerating} className="h-7">
              {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
              1
            </Button>
            <Button size="sm" variant="outline" onClick={() => onGenerateItems(3, { gradedOnly: true })} disabled={isGenerating} className="h-7">3</Button>
            <Button size="sm" variant="outline" onClick={() => onGenerateItems(5, { gradedOnly: true })} disabled={isGenerating} className="h-7">5</Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-14">Raw:</span>
            <Button size="sm" variant="ghost" onClick={() => onGenerateItems(1, { rawOnly: true })} disabled={isGenerating} className="h-7">
              <Plus className="h-3 w-3 mr-1" />1
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onGenerateItems(3, { rawOnly: true })} disabled={isGenerating} className="h-7">3</Button>
            <Button size="sm" variant="ghost" onClick={() => onGenerateItems(5, { rawOnly: true })} disabled={isGenerating} className="h-7">5</Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-14">Mixed:</span>
            <Button size="sm" variant="secondary" onClick={() => onGenerateItems(5)} disabled={isGenerating} className="h-7">5 Mixed</Button>
            <Button size="sm" variant="ghost" onClick={onReload} className="h-7">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reload
            </Button>
          </div>
        </div>

        <Separator />

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onCleanupAll}
          disabled={isCleaningUp || testItems.length === 0}
        >
          {isCleaningUp ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          Delete All Test Items ({testItems.length})
        </Button>
      </div>
    </div>
  );
}
