import React from 'react';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TagFilterDropdown } from './TagFilterDropdown';
import type { TagCount } from '@/hooks/useShopifyTags';
import type { CategoryCount, GroupedCategories } from '@/hooks/useCategoryFilter';

interface MoreFiltersPopoverProps {
  // Type filter
  typeFilter: 'all' | 'raw' | 'graded';
  onTypeFilterChange: (value: 'all' | 'raw' | 'graded') => void;
  
  // Category filter - now dynamic
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories?: CategoryCount[];
  groupedCategories?: GroupedCategories[];
  isLoadingCategories?: boolean;
  
  // Shopify sync filter
  shopifySyncFilter: 'all' | 'not-synced' | 'synced' | 'queued' | 'error';
  onShopifySyncFilterChange: (value: 'all' | 'not-synced' | 'synced' | 'queued' | 'error') => void;
  
  // eBay status filter
  ebayStatusFilter: 'all' | 'not-listed' | 'listed' | 'queued' | 'error';
  onEbayStatusFilterChange: (value: 'all' | 'not-listed' | 'listed' | 'queued' | 'error') => void;
  
  // Print status filter
  printStatusFilter: 'all' | 'printed' | 'not-printed';
  onPrintStatusFilterChange: (value: 'all' | 'printed' | 'not-printed') => void;
  
  // Date range filter
  dateRangeFilter: 'all' | 'today' | 'yesterday' | '7days' | '30days';
  onDateRangeFilterChange: (value: 'all' | 'today' | 'yesterday' | '7days' | '30days') => void;
  
  // Batch filter
  batchFilter: 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch';
  onBatchFilterChange: (value: 'all' | 'in_batch' | 'removed_from_batch' | 'current_batch') => void;
  
  // Tag filter
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
  shopifyTags: TagCount[];
  isLoadingTags: boolean;
}

export function MoreFiltersPopover({
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories = [],
  groupedCategories = [],
  isLoadingCategories = false,
  shopifySyncFilter,
  onShopifySyncFilterChange,
  ebayStatusFilter,
  onEbayStatusFilterChange,
  printStatusFilter,
  onPrintStatusFilterChange,
  dateRangeFilter,
  onDateRangeFilterChange,
  batchFilter,
  onBatchFilterChange,
  tagFilter,
  onTagFilterChange,
  shopifyTags,
  isLoadingTags,
}: MoreFiltersPopoverProps) {
  // Count active filters
  const activeFilterCount = [
    typeFilter !== 'all',
    categoryFilter !== 'all',
    shopifySyncFilter !== 'all',
    ebayStatusFilter !== 'all',
    printStatusFilter !== 'all',
    dateRangeFilter !== 'all',
    batchFilter !== 'all',
    tagFilter.length > 0,
  ].filter(Boolean).length;

  const handleClearAll = () => {
    onTypeFilterChange('all');
    onCategoryFilterChange('all');
    onShopifySyncFilterChange('all');
    onEbayStatusFilterChange('all');
    onPrintStatusFilterChange('all');
    onDateRangeFilterChange('all');
    onBatchFilterChange('all');
    onTagFilterChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant={activeFilterCount > 0 ? "default" : "outline"} 
          size="sm"
          className="h-9"
        >
          <SlidersHorizontal className="h-4 w-4 mr-1.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 w-5 p-0 justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Additional Filters</h4>
            {activeFilterCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearAll}
                className="h-7 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="grid gap-3">
            {/* Type Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={typeFilter} onValueChange={onTypeFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="raw">Raw</SelectItem>
                  <SelectItem value="graded">Graded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter - Dynamic from Shopify */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={isLoadingCategories ? "Loading..." : "All Categories"} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Categories</SelectItem>
                  
                  {/* Render grouped categories */}
                  {groupedCategories.map((group) => (
                    <SelectGroup key={group.group}>
                      <SelectLabel className="text-xs text-muted-foreground font-semibold px-2 py-1">
                        {group.group}
                      </SelectLabel>
                      {group.categories.map((cat) => (
                        <SelectItem key={cat.category} value={cat.category}>
                          {cat.category} ({cat.count})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  
                  {/* Fallback: if no grouped categories, show flat list */}
                  {groupedCategories.length === 0 && categories.length > 0 && (
                    categories.map((cat) => (
                      <SelectItem key={cat.category} value={cat.category}>
                        {cat.category} ({cat.count})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Shopify Sync Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Shopify Status</label>
              <Select value={shopifySyncFilter} onValueChange={onShopifySyncFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="not-synced">Not Synced</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* eBay Status Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">eBay Status</label>
              <Select value={ebayStatusFilter} onValueChange={onEbayStatusFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="not-listed">Not Listed</SelectItem>
                  <SelectItem value="listed">Listed</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Print Status Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Print Status</label>
              <Select value={printStatusFilter} onValueChange={onPrintStatusFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="printed">Printed</SelectItem>
                  <SelectItem value="not-printed">Not Printed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date Added</label>
              <Select value={dateRangeFilter} onValueChange={onDateRangeFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Batch Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Batch Status</label>
              <Select value={batchFilter} onValueChange={onBatchFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  <SelectItem value="in_batch">In Batch</SelectItem>
                  <SelectItem value="removed_from_batch">Removed from Batch</SelectItem>
                  <SelectItem value="current_batch">Current Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tag Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tags</label>
              <TagFilterDropdown
                tags={shopifyTags}
                selectedTags={tagFilter}
                onTagsChange={onTagFilterChange}
                isLoading={isLoadingTags}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
