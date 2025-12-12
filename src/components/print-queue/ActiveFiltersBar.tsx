import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Trash2 } from 'lucide-react';

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface ActiveFiltersBarProps {
  filters: ActiveFilter[];
  onRemoveFilter: (key: string, value?: string) => void;
  onClearAll: () => void;
}

export function ActiveFiltersBar({ filters, onRemoveFilter, onClearAll }: ActiveFiltersBarProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2 px-1">
      <span className="text-sm text-muted-foreground font-medium">Active filters:</span>
      {filters.map((filter, index) => (
        <Badge 
          key={`${filter.key}-${filter.value}-${index}`}
          variant="secondary" 
          className="cursor-pointer hover:bg-secondary/80 transition-colors gap-1 pr-1"
          onClick={() => onRemoveFilter(filter.key, filter.value)}
        >
          <span className="text-muted-foreground text-xs">{filter.label}:</span>
          <span>{filter.displayValue}</span>
          <X className="h-3 w-3 ml-0.5 hover:text-destructive" />
        </Badge>
      ))}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onClearAll}
        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Clear all
      </Button>
    </div>
  );
}
