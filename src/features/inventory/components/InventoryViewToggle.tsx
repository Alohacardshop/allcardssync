import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InventoryViewMode = 'card' | 'table';

interface InventoryViewToggleProps {
  mode: InventoryViewMode;
  onChange: (mode: InventoryViewMode) => void;
}

export const InventoryViewToggle = memo(({ mode, onChange }: InventoryViewToggleProps) => {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-md",
          mode === 'card' && "bg-background shadow-sm"
        )}
        onClick={() => onChange('card')}
      >
        <LayoutGrid className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Cards</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-md",
          mode === 'table' && "bg-background shadow-sm"
        )}
        onClick={() => onChange('table')}
      >
        <Table2 className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Table</span>
      </Button>
    </div>
  );
});

InventoryViewToggle.displayName = 'InventoryViewToggle';
