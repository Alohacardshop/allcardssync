/**
 * Individual item row with selection, status icons, and compact display
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { E2EStatusIcons } from './E2EStatusIcons';
import type { TestItemWithStatus } from '@/hooks/useE2ETest';
import { buildTestItemTitle } from '@/lib/testDataGenerator';

interface E2EItemRowProps {
  item: TestItemWithStatus;
  isSelected: boolean;
  onToggle: () => void;
}

export function E2EItemRow({ item, isSelected, onToggle }: E2EItemRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
        'hover:bg-accent/50',
        isSelected && 'bg-accent'
      )}
      onClick={onToggle}
    >
      <Checkbox 
        checked={isSelected} 
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {item.sku}
          </code>
          <Badge 
            variant={item.type === 'Graded' ? 'default' : 'secondary'}
            className="text-xs h-5"
          >
            {item.type}
          </Badge>
          {item.grade && (
            <Badge variant="outline" className="text-xs h-5">
              {item.grading_company} {item.grade}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {buildTestItemTitle(item)}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-medium tabular-nums">
          ${item.price?.toFixed(2) || '0.00'}
        </span>
        <E2EStatusIcons 
          itemStatus={item.status}
          shopifyError={item.shopify_sync_error}
          ebayError={item.ebay_sync_error}
          printedAt={item.printed_at}
        />
      </div>
    </div>
  );
}
