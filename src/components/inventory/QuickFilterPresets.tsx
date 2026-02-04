import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ClipboardCheck, 
  AlertTriangle, 
  Tag, 
  Package, 
  Calendar, 
  X,
  Store,
  Loader2,
  Sparkles,
  Trophy
} from 'lucide-react';

export interface QuickFilterState {
  shopifySyncFilter: 'all' | 'not-synced' | 'synced' | 'queued' | 'error';
  ebayStatusFilter: 'all' | 'not-listed' | 'listed' | 'queued' | 'error';
  printStatusFilter: 'all' | 'printed' | 'not-printed';
  dateRangeFilter: 'all' | 'today' | 'yesterday' | '7days' | '30days';
  statusFilter: 'all' | 'active' | 'out-of-stock' | 'sold' | 'deleted' | 'errors';
  categoryFilter?: 'all' | 'tcg' | 'comics' | 'sealed';
  tagFilter?: string[]; // Shopify tags filter
}

interface QuickFilterPresetsProps {
  onApplyPreset: (preset: Partial<QuickFilterState>) => void;
  onClearFilters: () => void;
  activePreset: string | null;
}

export const QuickFilterPresets = React.memo(({
  onApplyPreset,
  onClearFilters,
  activePreset
}: QuickFilterPresetsProps) => {
  const presets = [
    // Category presets (using normalized tags)
    {
      id: 'pokemon',
      label: 'Pokemon',
      icon: Sparkles,
      description: 'Pokemon cards only',
      filters: {
        tagFilter: ['pokemon'],
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'sports',
      label: 'Sports',
      icon: Trophy,
      description: 'Sports cards (baseball, basketball, football)',
      filters: {
        tagFilter: ['sports'],
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'graded-items',
      label: 'Graded',
      icon: Trophy,
      description: 'Graded items by PSA, CGC, etc.',
      filters: {
        tagFilter: ['graded'],
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'sealed-products',
      label: 'Sealed',
      icon: Package,
      description: 'Sealed products only',
      filters: {
        tagFilter: ['sealed'],
        statusFilter: 'active' as const,
      }
    },
    // Sync status presets
    {
      id: 'ready-to-sync',
      label: 'Ready to Sync',
      icon: ClipboardCheck,
      description: 'Items not yet synced to Shopify',
      filters: {
        shopifySyncFilter: 'not-synced' as const,
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'sync-errors',
      label: 'Sync Errors',
      icon: AlertTriangle,
      description: 'Items with sync errors',
      filters: {
        statusFilter: 'errors' as const,
      }
    },
    {
      id: 'on-shopify',
      label: 'On Shopify',
      icon: Store,
      description: 'Items synced to Shopify',
      filters: {
        shopifySyncFilter: 'synced' as const,
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'shopify-queued',
      label: 'Shopify Queue',
      icon: Loader2,
      description: 'Items queued/processing for Shopify sync',
      filters: {
        shopifySyncFilter: 'queued' as const,
        statusFilter: 'active' as const,
      }
    },
    // Print/eBay presets
    {
      id: 'needs-barcode',
      label: 'Needs Barcode',
      icon: Tag,
      description: 'Items not yet printed',
      filters: {
        printStatusFilter: 'not-printed' as const,
        statusFilter: 'active' as const,
      }
    },
    {
      id: 'not-on-ebay',
      label: 'Not on eBay',
      icon: Package,
      description: 'Items not listed on eBay',
      filters: {
        ebayStatusFilter: 'not-listed' as const,
        statusFilter: 'active' as const,
      }
    },
    // Date preset
    {
      id: 'todays-intake',
      label: "Today's Intake",
      icon: Calendar,
      description: 'Items added today',
      filters: {
        dateRangeFilter: 'today' as const,
        statusFilter: 'active' as const,
      }
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Quick Filters</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-muted-foreground hover:text-foreground h-7 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Clear All
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          
          return (
            <Button
              key={preset.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onApplyPreset(preset.filters)}
              className={`h-8 ${isActive ? "" : "hover:bg-accent"}`}
              title={preset.description}
            >
              <Icon className={`h-3.5 w-3.5 mr-1.5 ${preset.id === 'shopify-queued' && isActive ? 'animate-spin' : ''}`} />
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
});

QuickFilterPresets.displayName = 'QuickFilterPresets';
