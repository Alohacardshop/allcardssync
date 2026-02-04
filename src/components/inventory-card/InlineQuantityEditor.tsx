import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InlineQuantityEditorProps {
  itemId: string;
  quantity: number;
  shopifyProductId?: string | null;
  shopifyInventoryItemId?: string | null;
  compact?: boolean;
}

export const InlineQuantityEditor = memo(({
  itemId,
  quantity,
  shopifyProductId,
  shopifyInventoryItemId,
  compact = false,
}: InlineQuantityEditorProps) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(quantity.toString());
  const [pendingValue, setPendingValue] = useState<number | null>(null);

  // Reset edit value when quantity changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(quantity.toString());
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
      
      // Update database first
      const { error } = await supabase
        .from('intake_items')
        .update({ quantity: newQty })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // If synced to Shopify, update Shopify inventory too
      if (shopifyProductId && shopifyInventoryItemId) {
        const { data, error: syncError } = await supabase.functions.invoke('v2-shopify-set-inventory', {
          body: { item_id: itemId, quantity: newQty }
        });
        
        if (syncError) {
          console.error('Shopify sync error:', syncError);
          return { newQty, syncedToShopify: false, syncError: syncError.message };
        }
        
        return { newQty, syncedToShopify: data?.synced_to_shopify || false };
      }
      
      return { newQty, syncedToShopify: false };
    },
    onSuccess: ({ newQty, syncedToShopify, syncError }) => {
      setPendingValue(null);
      
      if (syncError) {
        toast.warning(`Qty → ${newQty} (Shopify sync failed)`, {
          description: syncError,
        });
      } else if (syncedToShopify) {
        toast.success(`Qty → ${newQty}`, { description: 'Synced to Shopify' });
      } else {
        toast.success(`Qty → ${newQty}`);
      }
      
      setIsEditing(false);
      setEditValue(newQty.toString());
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
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
  }, [quantity]);

  const handleStartEdit = useCallback(() => {
    setEditValue(quantity.toString());
    setIsEditing(true);
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

  const isPending = updateQuantityMutation.isPending;
  const displayValue = pendingValue !== null ? pendingValue : quantity;

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
