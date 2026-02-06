import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, XCircle } from 'lucide-react';

interface ActiveFilterChipsProps {
  tagFilter: string[];
  shopifySyncFilter: string;
  ebayStatusFilter: string;
  printStatusFilter: string;
  dateRangeFilter: string;
  statusFilter: string;
  typeFilter: string;
  categoryFilter?: string;
  collectionFilter?: string;
  collectionName?: string; // Display name for the collection
  locationName?: string;
  onRemoveTag: (tag: string) => void;
  onClearFilter: (filterType: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  tagFilter,
  shopifySyncFilter,
  ebayStatusFilter,
  printStatusFilter,
  dateRangeFilter,
  statusFilter,
  typeFilter,
  categoryFilter,
  collectionFilter,
  collectionName,
  locationName,
  onRemoveTag,
  onClearFilter,
  onClearAll
}: ActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; filterType: string }> = [];

  // Add tag chips
  tagFilter.forEach(tag => {
    chips.push({ key: `tag-${tag}`, label: tag, filterType: `tag:${tag}` });
  });

  // Add filter chips
  if (shopifySyncFilter !== 'all') {
    const labels: Record<string, string> = {
      'not-synced': 'Not on Shopify',
      'synced': 'On Shopify',
      'queued': 'Shopify Queue',
      'error': 'Shopify Error'
    };
    chips.push({ key: 'shopify', label: labels[shopifySyncFilter] || shopifySyncFilter, filterType: 'shopifySyncFilter' });
  }

  if (ebayStatusFilter !== 'all') {
    const labels: Record<string, string> = {
      'not-listed': 'Not on eBay',
      'listed': 'On eBay',
      'queued': 'eBay Queue',
      'error': 'eBay Error'
    };
    chips.push({ key: 'ebay', label: labels[ebayStatusFilter] || ebayStatusFilter, filterType: 'ebayStatusFilter' });
  }

  if (printStatusFilter !== 'all') {
    chips.push({ 
      key: 'print', 
      label: printStatusFilter === 'printed' ? 'Printed' : 'Not Printed', 
      filterType: 'printStatusFilter' 
    });
  }

  if (dateRangeFilter !== 'all') {
    const labels: Record<string, string> = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days'
    };
    chips.push({ key: 'date', label: labels[dateRangeFilter] || dateRangeFilter, filterType: 'dateRangeFilter' });
  }

  if (statusFilter !== 'active') {
    const labels: Record<string, string> = {
      'all': 'All Status',
      'out-of-stock': 'Out of Stock',
      'sold': 'Sold',
      'deleted': 'Deleted',
      'errors': 'Errors'
    };
    chips.push({ key: 'status', label: labels[statusFilter] || statusFilter, filterType: 'statusFilter' });
  }

  if (typeFilter !== 'all') {
    chips.push({ 
      key: 'type', 
      label: typeFilter === 'raw' ? 'Raw' : 'Graded', 
      filterType: 'typeFilter' 
    });
  }

  // Collection filter (new) - takes precedence over category
  if (collectionFilter && collectionFilter !== 'all') {
    chips.push({ 
      key: 'collection', 
      label: collectionName || 'Collection', 
      filterType: 'collectionFilter' 
    });
  } else if (categoryFilter && categoryFilter !== 'all') {
    // Legacy category filter (backwards compatibility)
    chips.push({ key: 'category', label: categoryFilter, filterType: 'categoryFilter' });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => {
              if (chip.filterType.startsWith('tag:')) {
                onRemoveTag(chip.filterType.replace('tag:', ''));
              } else {
                onClearFilter(chip.filterType);
              }
            }}
            className="ml-1 hover:bg-muted rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <XCircle className="h-3 w-3 mr-1" />
          Clear All
        </Button>
      )}
    </div>
  );
}
