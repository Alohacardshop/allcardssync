import React, { memo, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InlineQuantityEditorProps {
  itemId: string;
  quantity: number;
  shopifyProductId?: string | null;
  shopifyInventoryItemId?: string | null;
}

export const InlineQuantityEditor = memo(({
  itemId,
  quantity,
  shopifyProductId,
  shopifyInventoryItemId,
}: InlineQuantityEditorProps) => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(quantity.toString());

  const updateQuantityMutation = useMutation({
    mutationFn: async (newQty: number) => {
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
      if (syncError) {
        toast.warning(`Quantity updated locally, but Shopify sync failed: ${syncError}`);
      } else if (syncedToShopify) {
        toast.success(`Quantity updated to ${newQty} (synced to Shopify)`);
      } else {
        toast.success(`Quantity updated to ${newQty}`);
      }
      
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update quantity');
    },
  });

  const handleSave = useCallback(() => {
    const newQty = parseInt(editValue, 10);
    if (isNaN(newQty) || newQty < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    updateQuantityMutation.mutate(newQty);
  }, [editValue, updateQuantityMutation]);

  const handleCancel = useCallback(() => {
    setEditValue(quantity.toString());
    setIsEditing(false);
  }, [quantity]);

  const handleStartEdit = useCallback(() => {
    setEditValue(quantity.toString());
    setIsEditing(true);
  }, [quantity]);

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-6 w-16 text-xs px-1"
          min={0}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={handleSave}
          disabled={updateQuantityMutation.isPending}
        >
          {updateQuantityMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3 text-primary" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={handleCancel}
          disabled={updateQuantityMutation.isPending}
        >
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex items-center space-x-1 hover:bg-muted rounded px-1 -ml-1 cursor-pointer"
          onClick={handleStartEdit}
        >
          <span>Qty: {quantity}</span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Click to edit quantity</p>
      </TooltipContent>
    </Tooltip>
  );
});

InlineQuantityEditor.displayName = 'InlineQuantityEditor';
