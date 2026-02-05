import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, MapPin, X, Package } from 'lucide-react';
import { MoreFiltersPopover } from '@/components/inventory/MoreFiltersPopover';
import type { InventoryFiltersBarProps } from '../types';

// Active filter chip component
const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <Badge variant="secondary" className="gap-1 pr-1 text-xs font-normal h-6">
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
  locationsMap,
  shopifyTags,
  isLoadingTags,
  searchInputRef,
}: InventoryFiltersBarProps) => {
  // Build active filter chips
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  // Status filter chip (only if not default 'active')
  if (filters.statusFilter !== 'active') {
    const labels: Record<string, string> = {
      'all': 'All Status',
      'out-of-stock': 'Out of Stock',
      'sold': 'Sold',
      'errors': 'Errors',
      'deleted': 'Deleted'
    };
    activeChips.push({
      key: 'status',
      label: labels[filters.statusFilter] || filters.statusFilter,
      onRemove: () => onFilterChange('statusFilter', 'active')
    });
  }

  // Location filter chip
  if (filters.locationFilter) {
    const locationName = locationsMap?.get(filters.locationFilter)?.location_name || 'Location';
    activeChips.push({
      key: 'location',
      label: locationName,
      onRemove: () => onFilterChange('locationFilter', null)
    });
  }

  // Location availability filter chip
  if (filters.locationAvailability !== 'any') {
    const labels: Record<string, string> = {
      'at-selected': 'In Stock at Location',
      'anywhere': 'In Stock Anywhere'
    };
    activeChips.push({
      key: 'locationAvailability',
      label: labels[filters.locationAvailability] || filters.locationAvailability,
      onRemove: () => onFilterChange('locationAvailability', 'any')
    });
  }

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

  if (filters.batchFilter !== 'all') {
    const labels: Record<string, string> = {
      'current': 'Current Batch',
      'recent': 'Recent Batches'
    };
    activeChips.push({
      key: 'batch',
      label: labels[filters.batchFilter] || filters.batchFilter,
      onRemove: () => onFilterChange('batchFilter', 'all')
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

  // Check if any non-default filters are active (for Clear All button)
  const hasActiveFilters = activeChips.length > 0 || filters.searchTerm.length > 0;

  return (
    <div className="space-y-2">
      {/* Primary Filters Row - Search + Status + Location + Stock Filter + More */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search - takes available space but capped */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search... (/)"
            value={filters.searchTerm}
            onChange={(e) => onFilterChange('searchTerm', e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        
        {/* Status Filter */}
        <Select 
          value={filters.statusFilter} 
          onValueChange={(value: any) => { 
            onFilterChange('statusFilter', value); 
            onFilterChange('activeQuickFilter', null); 
          }}
        >
          <SelectTrigger className="w-[110px] h-9 shrink-0">
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
          <SelectTrigger className="w-[130px] h-9 shrink-0">
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

        {/* Stock/Availability Filter - only show when a location is selected OR always for "anywhere" */}
        <Select 
          value={filters.locationAvailability} 
          onValueChange={(value: any) => onFilterChange('locationAvailability', value)}
        >
          <SelectTrigger className="w-[140px] h-9 shrink-0">
            <Package className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Stock</SelectItem>
            <SelectItem value="at-selected" disabled={!filters.locationFilter}>
              In Stock at Location
            </SelectItem>
            <SelectItem value="anywhere">In Stock Anywhere</SelectItem>
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

      {/* Active filter chips - always visible when filters active */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1.5 min-h-[32px]">
          <span className="text-xs text-muted-foreground shrink-0">Active:</span>
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {filters.searchTerm && (
              <FilterChip 
                label={`"${filters.searchTerm}"`} 
                onRemove={() => onFilterChange('searchTerm', '')} 
              />
            )}
            {activeChips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAllFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
});

InventoryFiltersBar.displayName = 'InventoryFiltersBar';
