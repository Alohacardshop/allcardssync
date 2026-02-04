import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Minus, Plus, Loader2, RefreshCw, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InlineQuantityEditorProps {
  itemId: string;
  quantity: number;
  shopifyProductId?: string | null;
  shopifyInventoryItemId?: string | null;
  /** Last known Shopify available quantity for optimistic locking */
  shopifyLastKnownAvailable?: number | null;
  compact?: boolean;
  onRefreshNeeded?: () => void;
  /** When true, editing is disabled (e.g., Shopify truth mode) */
  readOnly?: boolean;
  /** Message to show when readOnly */
  readOnlyReason?: string;
}

export const InlineQuantityEditor = memo(({
  itemId,
  quantity,
  shopifyProductId,
  shopifyInventoryItemId,
  shopifyLastKnownAvailable,
  compact = false,
  onRefreshNeeded,
  readOnly = false,
  readOnlyReason = 'Quantity is managed by Shopify',
}: InlineQuantityEditorProps) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(quantity.toString());
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [staleDataError, setStaleDataError] = useState<{ current: number } | null>(null);

  // Track the original quantity when editing started for delta calculation
  const originalQtyRef = useRef(quantity);

  // Reset edit value when quantity changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(quantity.toString());
      originalQtyRef.current = quantity;
      setStaleDataError(null);
    }
  }, [quantity, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const updateQuantityMutation = useMutation({
    mutationFn: async (newQty: number) => {
      setPendingValue(newQty);
      setStaleDataError(null);
      
      const originalQty = originalQtyRef.current;
      const delta = newQty - originalQty;
      
      // Update database first
      const { error } = await supabase
        .from('intake_items')
        .update({ quantity: newQty })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // If synced to Shopify, update Shopify inventory using delta-based adjustment
      if (shopifyProductId && shopifyInventoryItemId) {
        const { data, error: syncError } = await supabase.functions.invoke('v2-shopify-set-inventory', {
          body: { 
            item_id: itemId, 
            quantity: delta, // Pass delta, not absolute value
            mode: 'adjust',
            // Pass expected_available for optimistic locking
            expected_available: typeof shopifyLastKnownAvailable === 'number' 
              ? shopifyLastKnownAvailable 
              : undefined
          }
        });
        
        // Handle stale data error (409 Conflict)
        if (data?.error === 'STALE_DATA') {
          return { 
            newQty, 
            syncedToShopify: false, 
            staleData: true,
            currentShopifyAvailable: data.current_available
          };
        }
        
        // Handle insufficient inventory
        if (data?.error === 'INSUFFICIENT_INVENTORY') {
          throw new Error(data.message || 'Insufficient inventory');
        }
        
        if (syncError) {
          console.error('Shopify sync error:', syncError);
          return { newQty, syncedToShopify: false, syncError: syncError.message };
        }
        
        return { 
          newQty, 
          syncedToShopify: data?.synced_to_shopify || false,
          newShopifyAvailable: data?.new_available
        };
      }
      
      return { newQty, syncedToShopify: false };
    },
    onSuccess: ({ newQty, syncedToShopify, syncError, staleData, currentShopifyAvailable, newShopifyAvailable }) => {
      setPendingValue(null);
      
      if (staleData) {
        setStaleDataError({ current: currentShopifyAvailable });
        toast.error('Inventory changed in Shopify', {
          description: `Current: ${currentShopifyAvailable}. Please refresh and try again.`,
          action: onRefreshNeeded ? {
            label: 'Refresh',
            onClick: () => {
              onRefreshNeeded();
              setStaleDataError(null);
            }
          } : undefined
        });
        return;
      }
      
      if (syncError) {
        toast.warning(`Qty → ${newQty} (Shopify sync failed)`, {
          description: syncError,
        });
      } else if (syncedToShopify) {
        toast.success(`Qty → ${newQty}`, { 
          description: `Synced to Shopify (${newShopifyAvailable ?? newQty})` 
        });
      } else {
        toast.success(`Qty → ${newQty}`);
      }
      
      setIsEditing(false);
      setEditValue(newQty.toString());
      originalQtyRef.current = newQty;
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
    },
    onError: (error: Error) => {
      setPendingValue(null);
      toast.error(error.message || 'Failed to update quantity');
    },
  });

  const handleSave = useCallback(() => {
    const newQty = parseInt(editValue, 10);
    if (isNaN(newQty) || newQty < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (newQty === quantity) {
      setIsEditing(false);
      return;
    }
    updateQuantityMutation.mutate(newQty);
  }, [editValue, quantity, updateQuantityMutation]);

  const handleCancel = useCallback(() => {
    setEditValue(quantity.toString());
    setIsEditing(false);
    setStaleDataError(null);
  }, [quantity]);

  const handleStartEdit = useCallback(() => {
    setEditValue(quantity.toString());
    originalQtyRef.current = quantity;
    setIsEditing(true);
    setStaleDataError(null);
  }, [quantity]);

  const handleIncrement = useCallback((delta: number) => {
    const currentQty = parseInt(editValue, 10) || 0;
    const newQty = Math.max(0, currentQty + delta);
    setEditValue(newQty.toString());
  }, [editValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleIncrement(-1);
    }
  }, [handleSave, handleCancel, handleIncrement]);

  const handleRefresh = useCallback(() => {
    onRefreshNeeded?.();
    setStaleDataError(null);
  }, [onRefreshNeeded]);

  const isPending = updateQuantityMutation.isPending;
  const displayValue = pendingValue !== null ? pendingValue : quantity;

  // Stale data state - show refresh prompt
  if (staleDataError) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-destructive font-medium">
          {staleDataError.current}
        </span>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Shopify inventory changed. Click to refresh.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Edit mode - inline input with steppers
  if (isEditing) {
    return (
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={() => handleIncrement(-1)}
          disabled={isPending || parseInt(editValue) <= 0}
          tabIndex={-1}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={editValue}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            setEditValue(val);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Small delay to allow button clicks to register
            setTimeout(() => {
              if (!isPending) {
                handleSave();
              }
            }, 150);
          }}
          className={cn(
            "h-6 w-10 text-center text-xs font-medium rounded border bg-background",
            "focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
            isPending && "opacity-50"
          )}
          disabled={isPending}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={() => handleIncrement(1)}
          disabled={isPending}
          tabIndex={-1}
        >
          <Plus className="h-3 w-3" />
        </Button>
        {isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />
        )}
      </div>
    );
  }

  // Read-only mode - show quantity with lock icon
  if (readOnly) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex items-center justify-center gap-1 rounded font-medium tabular-nums",
                "text-muted-foreground cursor-not-allowed",
                compact ? "h-6 min-w-[28px] px-1.5 text-xs" : "h-7 min-w-[32px] px-2 text-sm"
              )}
            >
              <Lock className="h-3 w-3 opacity-50" />
              {displayValue}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            <p>{readOnlyReason}</p>
            <p className="text-muted-foreground mt-1">Use Receiving or Transfer to adjust</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Display mode - clickable quantity
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-center rounded font-medium tabular-nums",
              "hover:bg-muted/80 transition-colors cursor-pointer",
              compact ? "h-6 min-w-[28px] px-1.5 text-xs" : "h-7 min-w-[32px] px-2 text-sm",
              isPending && "opacity-50"
            )}
            onClick={handleStartEdit}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              displayValue
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Click to edit • Arrow keys to adjust
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

InlineQuantityEditor.displayName = 'InlineQuantityEditor';
