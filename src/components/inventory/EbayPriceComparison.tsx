import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface EbayPriceComparisonProps {
  currentPrice: number;
  ebayData?: {
    checked_at: string;
    ebay_average: number;
    difference_percent: number;
    price_count: number;
  };
  onCheck?: () => void;
}

export function EbayPriceComparison({ currentPrice, ebayData, onCheck }: EbayPriceComparisonProps) {
  if (!ebayData) {
    return (
      <button
        onClick={onCheck}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Check eBay
      </button>
    );
  }

  const { ebay_average, difference_percent, price_count, checked_at } = ebayData;
  const absDiff = Math.abs(difference_percent);

  // Color coding based on difference
  let variant: 'default' | 'secondary' | 'destructive' = 'default';
  let icon = <Minus className="h-3 w-3" />;

  if (absDiff > 20) {
    variant = 'destructive';
    icon = difference_percent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
  } else if (absDiff > 10) {
    variant = 'secondary';
    icon = difference_percent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
  }

  const checkedDate = new Date(checked_at);
  const isStale = Date.now() - checkedDate.getTime() > 24 * 60 * 60 * 1000; // 24 hours

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className="gap-1 cursor-help">
            {icon}
            <span>${ebay_average.toFixed(2)}</span>
            <span className="text-xs">({difference_percent > 0 ? '+' : ''}{difference_percent.toFixed(0)}%)</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">eBay Comparison</p>
            <p className="text-sm">
              Your price: <span className="font-semibold">${currentPrice.toFixed(2)}</span>
            </p>
            <p className="text-sm">
              eBay avg: <span className="font-semibold">${ebay_average.toFixed(2)}</span> ({price_count} sales)
            </p>
            <p className="text-sm">
              Difference: <span className="font-semibold">{difference_percent > 0 ? '+' : ''}{difference_percent.toFixed(1)}%</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Checked: {checkedDate.toLocaleDateString()} {checkedDate.toLocaleTimeString()}
              {isStale && ' (stale)'}
            </p>
            {onCheck && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheck();
                }}
                className="text-xs text-primary hover:underline mt-1"
              >
                Refresh prices
              </button>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
