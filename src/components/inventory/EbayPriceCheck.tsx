import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EbayPriceCheckProps {
  itemId: string;
  currentPrice?: number;
  searchQuery: string;
  priceCheckData?: {
    checked_at: string;
    ebay_average: number;
    difference_percent?: number;
    price_count: number;
  } | null;
  onUpdate?: () => void;
}

export const EbayPriceCheck = React.memo(({
  itemId,
  currentPrice,
  searchQuery,
  priceCheckData,
  onUpdate
}: EbayPriceCheckProps) => {
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<any>(null);

  const checkPrice = async () => {
    if (!searchQuery) {
      toast.error('No search query available for this item');
      return;
    }
    
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-price-check', {
        body: { 
          searchQuery, 
          itemId, 
          currentPrice: currentPrice || 0 
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResults(data);
      toast.success(`Found ${data.priceCount} comparable listings`);
      onUpdate?.();
    } catch (error: any) {
      toast.error('Price check failed: ' + error.message);
    } finally {
      setChecking(false);
    }
  };

  const getDifferenceColor = (diff?: number) => {
    if (diff === undefined) return 'text-muted-foreground';
    if (diff > 10) return 'text-green-600';
    if (diff < -10) return 'text-red-600';
    return 'text-yellow-600';
  };

  const getDifferenceIcon = (diff?: number) => {
    if (diff === undefined) return <Minus className="h-3 w-3" />;
    if (diff > 5) return <TrendingUp className="h-3 w-3" />;
    if (diff < -5) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const displayData = results || priceCheckData;
  const diffPercent = displayData?.difference_percent ?? displayData?.differencePercent;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "h-7 px-2 gap-1",
            displayData && getDifferenceColor(diffPercent)
          )}
          onClick={(e) => {
            if (!priceCheckData && !results) {
              e.preventDefault();
              checkPrice();
            }
          }}
        >
          {checking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <DollarSign className="h-3 w-3" />
              {displayData ? (
                <>
                  {getDifferenceIcon(diffPercent)}
                  <span className="text-xs">
                    {diffPercent !== undefined 
                      ? `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(0)}%`
                      : 'Check'
                    }
                  </span>
                </>
              ) : (
                <span className="text-xs">eBay</span>
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">eBay Price Comparison</h4>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={checkPrice}
              disabled={checking || !searchQuery}
            >
              {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {displayData ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-muted rounded">
                  <p className="text-muted-foreground text-xs">Your Price</p>
                  <p className="font-semibold">${currentPrice?.toFixed(2) || '—'}</p>
                </div>
                <div className="p-2 bg-muted rounded">
                  <p className="text-muted-foreground text-xs">eBay Average</p>
                  <p className="font-semibold">
                    ${(displayData.ebay_average ?? displayData.ebayAverage)?.toFixed(2) || '—'}
                  </p>
                </div>
              </div>

              {diffPercent !== undefined && (
                <div className={cn(
                  "p-2 rounded text-center",
                  getDifferenceColor(diffPercent)
                )}>
                  <p className="text-xs">Price Difference</p>
                  <p className="font-bold text-lg flex items-center justify-center gap-1">
                    {getDifferenceIcon(diffPercent)}
                    {`${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%`}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Based on {displayData.price_count ?? displayData.priceCount ?? 0} sold listings</p>
                {displayData.checked_at && (
                  <p>Checked: {new Date(displayData.checked_at).toLocaleString()}</p>
                )}
              </div>

              {displayData.pricesUsed?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Prices used:</p>
                  <p className="text-xs text-muted-foreground">
                    ${displayData.pricesUsed.map((p: number) => p.toFixed(2)).join(', ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">No price data yet</p>
              <p className="text-xs">Click to check eBay sold prices</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

EbayPriceCheck.displayName = 'EbayPriceCheck';
