import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Filter, ChevronDown, X, RefreshCw } from 'lucide-react';
import { ActiveFiltersBar } from './ActiveFiltersBar';

type DateFilterType = 'today' | 'yesterday' | '7days' | '30days' | null;
type TypeFilterType = 'all' | 'raw' | 'graded';

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface FilterPanelProps {
  // Type & Category
  typeFilter: TypeFilterType;
  onTypeFilterChange: (value: TypeFilterType) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  availableCategories: string[];
  
  // Search
  searchTerm: string;
  onSearchChange: (value: string) => void;
  
  // Tags
  selectedIncludeTags: string[];
  onToggleIncludeTag: (tag: string) => void;
  selectedExcludeTags: string[];
  onToggleExcludeTag: (tag: string) => void;
  availableTags: string[];
  
  // Date
  dateFilter: DateFilterType;
  onDateFilterChange: (value: DateFilterType) => void;
  
  // Include printed toggle
  showPrintedItems: boolean;
  onShowPrintedItemsChange: (value: boolean) => void;
  
  // Active filters
  activeFilters: ActiveFilter[];
  onRemoveFilter: (key: string, value?: string) => void;
  onClearAllFilters: () => void;
  
  // Loading & Refresh
  loading: boolean;
  onRefresh: () => void;
  
  // Results info
  filteredCount: number;
  totalCount: number;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  selectedCount: number;
  onSelectAll: (checked: boolean) => void;
}

export function FilterPanel({
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  availableCategories,
  searchTerm,
  onSearchChange,
  selectedIncludeTags,
  onToggleIncludeTag,
  selectedExcludeTags,
  onToggleExcludeTag,
  availableTags,
  dateFilter,
  onDateFilterChange,
  showPrintedItems,
  onShowPrintedItemsChange,
  activeFilters,
  onRemoveFilter,
  onClearAllFilters,
  loading,
  onRefresh,
  filteredCount,
  totalCount,
  isAllSelected,
  isSomeSelected,
  selectedCount,
  onSelectAll,
}: FilterPanelProps) {
  return (
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
                      onCheckedChange={onShowPrintedItemsChange}
                    />
                    <Label htmlFor="show-printed" className="text-sm font-normal cursor-pointer">
                      Include Printed
                    </Label>
                    {!showPrintedItems && (
                      <span className="text-xs text-amber-500">(hiding printed items)</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Items are marked as printed after printing.</p>
                  <p className="text-xs text-muted-foreground">Turn on to see ALL items including already printed ones.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type and Category Filters */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Item Type</Label>
            <Select value={typeFilter} onValueChange={(v: TypeFilterType) => onTypeFilterChange(v)}>
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
            <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
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

        <div className="grid gap-4 md:grid-cols-3">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="SKU, title..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Include Tags */}
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
                          onSelect={() => onToggleIncludeTag(tag)}
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
                    onClick={() => onToggleIncludeTag(tag)}
                  >
                    {tag}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Exclude Tags */}
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
                          onSelect={() => onToggleExcludeTag(tag)}
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
                    onClick={() => onToggleExcludeTag(tag)}
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
          <Label>Date Added</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dateFilter === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDateFilterChange(dateFilter === 'today' ? null : 'today')}
            >
              Today
            </Button>
            <Button
              variant={dateFilter === 'yesterday' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDateFilterChange(dateFilter === 'yesterday' ? null : 'yesterday')}
            >
              Yesterday
            </Button>
            <Button
              variant={dateFilter === '7days' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDateFilterChange(dateFilter === '7days' ? null : '7days')}
            >
              Last 7 Days
            </Button>
            <Button
              variant={dateFilter === '30days' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDateFilterChange(dateFilter === '30days' ? null : '30days')}
            >
              Last 30 Days
            </Button>
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDateFilterChange(null)}
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
          onRemoveFilter={onRemoveFilter}
          onClearAll={onClearAllFilters}
        />

        {/* Results summary and Select All */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Loading...' : `Showing ${filteredCount} of ${totalCount} item(s)`}
            </div>
            {filteredCount > 0 && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={isAllSelected}
                  onCheckedChange={onSelectAll}
                  className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Select All {selectedCount > 0 && `(${selectedCount} selected)`}
                </label>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
