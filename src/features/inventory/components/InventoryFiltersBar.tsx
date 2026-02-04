import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, X } from 'lucide-react';
import { QuickFilterPresets, QuickFilterState } from '@/components/inventory/QuickFilterPresets';
import { MoreFiltersPopover } from '@/components/inventory/MoreFiltersPopover';
import type { InventoryFiltersBarProps, InventoryFilterState } from '../types';

// Active filter chip component
const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <Badge variant="secondary" className="gap-1 pr-1 text-xs font-normal">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="ml-0.5 hover:bg-muted-foreground/20 rounded-full p-0.5"
    >
      <X className="h-3 w-3" />
    </button>
  </Badge>
);

export const InventoryFiltersBar = React.memo(({
  filters,
  onFilterChange,
  onClearAllFilters,
  onApplyQuickFilter,
  locationsMap,
  shopifyTags,
  isLoadingTags,
  searchInputRef,
}: InventoryFiltersBarProps) => {
  // Map filter state to quick filter preset format
  const handleApplyPreset = (preset: Partial<QuickFilterState>) => {
    const mappedPreset: Partial<InventoryFilterState> = {};
    
    if (preset.shopifySyncFilter) mappedPreset.shopifySyncFilter = preset.shopifySyncFilter;
    if (preset.ebayStatusFilter) mappedPreset.ebayStatusFilter = preset.ebayStatusFilter;
    if (preset.printStatusFilter) mappedPreset.printStatusFilter = preset.printStatusFilter;
    if (preset.dateRangeFilter) mappedPreset.dateRangeFilter = preset.dateRangeFilter;
    if (preset.statusFilter) mappedPreset.statusFilter = preset.statusFilter;
    if (preset.categoryFilter) mappedPreset.categoryFilter = preset.categoryFilter;
    
    onApplyQuickFilter(mappedPreset);
  };

  // Build active filter chips
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (filters.shopifySyncFilter !== 'all') {
    const labels: Record<string, string> = {
      'not-synced': 'Not on Shopify',
      'synced': 'On Shopify',
      'queued': 'Shopify Queue',
      'error': 'Shopify Error'
    };
    activeChips.push({
      key: 'shopify',
      label: labels[filters.shopifySyncFilter] || filters.shopifySyncFilter,
      onRemove: () => onFilterChange('shopifySyncFilter', 'all')
    });
  }

  if (filters.ebayStatusFilter !== 'all') {
    const labels: Record<string, string> = {
      'not-listed': 'Not on eBay',
      'listed': 'On eBay',
      'queued': 'eBay Queue',
      'error': 'eBay Error'
    };
    activeChips.push({
      key: 'ebay',
      label: labels[filters.ebayStatusFilter] || filters.ebayStatusFilter,
      onRemove: () => onFilterChange('ebayStatusFilter', 'all')
    });
  }

  if (filters.printStatusFilter !== 'all') {
    activeChips.push({
      key: 'print',
      label: filters.printStatusFilter === 'printed' ? 'Printed' : 'Not Printed',
      onRemove: () => onFilterChange('printStatusFilter', 'all')
    });
  }

  if (filters.dateRangeFilter !== 'all') {
    const labels: Record<string, string> = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days'
    };
    activeChips.push({
      key: 'date',
      label: labels[filters.dateRangeFilter] || filters.dateRangeFilter,
      onRemove: () => onFilterChange('dateRangeFilter', 'all')
    });
  }

  if (filters.typeFilter !== 'all') {
    activeChips.push({
      key: 'type',
      label: filters.typeFilter === 'raw' ? 'Raw' : 'Graded',
      onRemove: () => onFilterChange('typeFilter', 'all')
    });
  }

  if (filters.categoryFilter !== 'all') {
    const labels: Record<string, string> = {
      'tcg': 'TCG',
      'comics': 'Comics',
      'sealed': 'Sealed'
    };
    activeChips.push({
      key: 'category',
      label: labels[filters.categoryFilter] || filters.categoryFilter,
      onRemove: () => onFilterChange('categoryFilter', 'all')
    });
  }

  if (filters.tagFilter && filters.tagFilter.length > 0) {
    filters.tagFilter.forEach(tag => {
      activeChips.push({
        key: `tag-${tag}`,
        label: tag,
        onRemove: () => onFilterChange('tagFilter', filters.tagFilter.filter(t => t !== tag))
      });
    });
  }

  return (
    <div className="space-y-3">
      {/* Quick Filter Presets - compact horizontal row */}
      <QuickFilterPresets
        onApplyPreset={handleApplyPreset}
        onClearFilters={onClearAllFilters}
        activePreset={filters.activeQuickFilter}
      />
      
      {/* Search + Filters Row */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search items... (press /)"
            value={filters.searchTerm}
            onChange={(e) => onFilterChange('searchTerm', e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        
        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <Select 
            value={filters.statusFilter} 
            onValueChange={(value: any) => { 
              onFilterChange('statusFilter', value); 
              onFilterChange('activeQuickFilter', null); 
            }}
          >
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="errors">Errors</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          {/* Location Filter */}
          <Select 
            value={filters.locationFilter || 'all'} 
            onValueChange={(value: string) => onFilterChange('locationFilter', value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[140px] h-9">
              <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locationsMap && Array.from(locationsMap.values()).map(loc => (
                <SelectItem key={loc.location_gid} value={loc.location_gid}>
                  {loc.location_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* More Filters Popover */}
          <MoreFiltersPopover
            typeFilter={filters.typeFilter}
            onTypeFilterChange={(value) => onFilterChange('typeFilter', value)}
            categoryFilter={filters.categoryFilter}
            onCategoryFilterChange={(value) => onFilterChange('categoryFilter', value)}
            shopifySyncFilter={filters.shopifySyncFilter}
            onShopifySyncFilterChange={(value) => { 
              onFilterChange('shopifySyncFilter', value); 
              onFilterChange('activeQuickFilter', null); 
            }}
            ebayStatusFilter={filters.ebayStatusFilter}
            onEbayStatusFilterChange={(value) => { 
              onFilterChange('ebayStatusFilter', value); 
              onFilterChange('activeQuickFilter', null); 
            }}
            printStatusFilter={filters.printStatusFilter}
            onPrintStatusFilterChange={(value) => { 
              onFilterChange('printStatusFilter', value); 
              onFilterChange('activeQuickFilter', null); 
            }}
            dateRangeFilter={filters.dateRangeFilter}
            onDateRangeFilterChange={(value) => { 
              onFilterChange('dateRangeFilter', value); 
              onFilterChange('activeQuickFilter', null); 
            }}
            batchFilter={filters.batchFilter}
            onBatchFilterChange={(value) => onFilterChange('batchFilter', value)}
            tagFilter={filters.tagFilter}
            onTagFilterChange={(tags) => onFilterChange('tagFilter', tags)}
            shopifyTags={shopifyTags}
            isLoadingTags={isLoadingTags}
          />
        </div>
      </div>

      {/* Active filter chips - compact row */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Filters:</span>
          {activeChips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      )}
    </div>
  );
});

InventoryFiltersBar.displayName = 'InventoryFiltersBar';
