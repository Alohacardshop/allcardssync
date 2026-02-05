import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { InventoryListItem } from '../../types';

interface PrintingSectionProps {
  item: InventoryListItem;
  onPrint: () => void;
}

export const PrintingSection = React.memo(({ item, onPrint }: PrintingSectionProps) => {
  const isPrinted = !!item.printed_at;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Printing</h3>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Badge 
          variant={isPrinted ? 'default' : 'outline'}
          className={isPrinted 
            ? 'bg-primary/10 text-primary border-primary/20' 
            : 'text-muted-foreground'}
        >
          {isPrinted ? 'Printed' : 'Not Printed'}
        </Badge>
      </div>

      {item.printed_at && (
        <div>
          <span className="text-sm text-muted-foreground">Printed At</span>
          <p className="text-sm">
            {format(new Date(item.printed_at), 'MMM d, yyyy h:mm a')}
            <span className="text-muted-foreground ml-1">
              ({formatDistanceToNow(new Date(item.printed_at), { addSuffix: true })})
            </span>
          </p>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onPrint}
        disabled={item.deleted_at !== null}
        className="w-full"
      >
        <Printer className="h-4 w-4 mr-2" />
        {isPrinted ? 'Reprint Label' : 'Print Label'}
      </Button>
    </div>
  );
});

PrintingSection.displayName = 'PrintingSection';
