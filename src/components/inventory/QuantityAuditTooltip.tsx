import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  ShoppingCart, 
  ArrowLeftRight, 
  RefreshCw, 
  Package, 
  RotateCcw,
  History,
  Loader2,
  Plus,
  Minus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface QuantityAuditTooltipProps {
  itemId: string;
  sku?: string | null;
  children: React.ReactNode;
}

interface RecentChange {
  id: string;
  date: string;
  action: string;
  delta: number | null;
  location?: string | null;
}

function getActionIcon(action: string) {
  switch (action) {
    case 'sale': return ShoppingCart;
    case 'cancellation':
    case 'refund': return RotateCcw;
    case 'transfer_out':
    case 'transfer_in': return ArrowLeftRight;
    case 'receiving': return Package;
    case 'reconciliation':
    case 'recount': return RefreshCw;
    default: return History;
  }
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'sale': 'Sale',
    'cancellation': 'Cancelled',
    'refund': 'Refund',
    'transfer_out': 'Transfer out',
    'transfer_in': 'Transfer in',
    'receiving': 'Received',
    'manual_adjustment': 'Adjusted',
    'recount': 'Recount',
    'reconciliation': 'Reconciled',
    'sync_correction': 'Sync fix',
    'initial_set': 'Initial',
    'push_inventory': 'Published',
  };
  return labels[action] || action.replace(/_/g, ' ');
}

/**
 * Lightweight tooltip showing recent quantity changes.
 * Only fetches data when user hovers (on open).
 */
export function QuantityAuditTooltip({ itemId, sku, children }: QuantityAuditTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only fetch when tooltip opens - keeps list view fast
  const { data: recentChanges, isLoading } = useQuery({
    queryKey: ['qty-audit-tooltip', itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_write_log')
        .select('id, created_at, action, delta, location_gid')
        .eq('item_id', itemId)
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      
      return (data || []).map(log => ({
        id: log.id,
        date: log.created_at,
        action: log.action,
        delta: log.delta,
        location: log.location_gid?.split('/').pop() || null,
      })) as RecentChange[];
    },
    enabled: isOpen, // Only fetch when open
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 60 * 1000, // 1 minute
  });

  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="left" 
        className="max-w-xs p-0 overflow-hidden"
        onPointerDownOutside={() => setIsOpen(false)}
      >
        <div className="px-3 py-2 border-b bg-muted/50">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <History className="h-3 w-3" />
            Recent Changes
          </span>
        </div>
        
        <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !recentChanges?.length ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No recent changes tracked
            </p>
          ) : (
            recentChanges.map(change => {
              const Icon = getActionIcon(change.action);
              const isPositive = change.delta !== null && change.delta > 0;
              const isNegative = change.delta !== null && change.delta < 0;
              
              return (
                <div key={change.id} className="flex items-center gap-2 text-xs">
                  <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">
                    {getActionLabel(change.action)}
                    {change.location && (
                      <span className="text-muted-foreground"> @ {change.location}</span>
                    )}
                  </span>
                  {change.delta !== null && (
                    <span className={cn(
                      "font-mono tabular-nums shrink-0",
                      isPositive && "text-green-600 dark:text-green-400",
                      isNegative && "text-red-600 dark:text-red-400"
                    )}>
                      {isPositive ? <Plus className="h-2.5 w-2.5 inline" /> : isNegative ? <Minus className="h-2.5 w-2.5 inline" /> : null}
                      {Math.abs(change.delta)}
                    </span>
                  )}
                  <span className="text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(change.date), { addSuffix: false })}
                  </span>
                </div>
              );
            })
          )}
        </div>
        
        <div className="px-3 py-1.5 border-t bg-muted/30 text-center">
          <span className="text-[10px] text-muted-foreground">
            Click item menu → "Why did this change?" for full history
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}