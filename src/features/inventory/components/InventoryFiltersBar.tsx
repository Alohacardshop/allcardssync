import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MapPin } from 'lucide-react';
import { QuickFilterPresets, QuickFilterState } from '@/components/inventory/QuickFilterPresets';
import { MoreFiltersPopover } from '@/components/inventory/MoreFiltersPopover';
import type { InventoryFiltersBarProps, InventoryFilterState } from '../types';

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

  return (
    <div className="space-y-4">
      {/* Quick Filter Presets - horizontal scrollable on mobile */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2">
        <QuickFilterPresets
          onApplyPreset={handleApplyPreset}
          onClearFilters={onClearAllFilters}
          activePreset={filters.activeQuickFilter}
        />
      </div>
      
      {/* Search + Filters Row */}
      <div className="border-t pt-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          {/* Search - takes more space */}
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search items... (press / to focus)"
              value={filters.searchTerm}
              onChange={(e) => onFilterChange('searchTerm', e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Filter controls row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <Select 
              value={filters.statusFilter} 
              onValueChange={(value: any) => { 
                onFilterChange('statusFilter', value); 
                onFilterChange('activeQuickFilter', null); 
              }}
            >
              <SelectTrigger className="w-[130px] h-9">
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
              <SelectTrigger className="w-[150px] h-9">
                <MapPin className="h-4 w-4 mr-1.5 text-muted-foreground shrink-0" />
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
      </div>
    </div>
  );
});

InventoryFiltersBar.displayName = 'InventoryFiltersBar';
