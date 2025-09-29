/**
 * Hook for managing idempotent Shopify product upserts
 */

import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { pushProductUpsert, markItemAsPushed, markItemPushFailed, UpsertCard } from '@/lib/shopify/upsert';
import { checkShopifyPushStatus } from '@/lib/shopify/lookup';
import { useStore } from '@/contexts/StoreContext';

interface UpsertState {
  processing: boolean;
  processed: number;
  total: number;
  errors: Array<{ itemId: string; error: string }>;
  successes: Array<{ itemId: string; productId: string }>;
}

export function useShopifyUpsert() {
  const { assignedStore } = useStore();
  
  const [state, setState] = useState<UpsertState>({
    processing: false,
    processed: 0,
    total: 0,
    errors: [],
    successes: []
  });

  const upsertItem = useCallback(async (intakeItemId: string, card: UpsertCard) => {
    if (!assignedStore) {
      throw new Error('No store selected');
    }
    try {
      // Check if already pushed to avoid duplicates
      const pushStatus = await checkShopifyPushStatus(intakeItemId);
      if (pushStatus.isPushed && pushStatus.shopifyProductId) {
        console.log(`Item ${intakeItemId} already pushed, skipping`);
        return {
          success: true,
          alreadyPushed: true,
          productId: pushStatus.shopifyProductId
        };
      }

      // Perform the upsert
      const result = await pushProductUpsert(assignedStore, card);
      
      if (result.success && result.product) {
        // Mark as pushed only after successful upsert
        await markItemAsPushed(
          intakeItemId, 
          result.product.id, 
          result.product.variantId
        );
        
        return {
          success: true,
          productId: result.product.id,
          wasUpdate: result.wasUpdate
        };
      } else {
        // Mark as failed
        await markItemPushFailed(intakeItemId, result.error || 'Unknown error');
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markItemPushFailed(intakeItemId, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }, [assignedStore]);

  const upsertBatch = useCallback(async (items: Array<{ id: string; card: UpsertCard }>) => {
    setState({
      processing: true,
      processed: 0,
      total: items.length,
      errors: [],
      successes: []
    });

    const errors: Array<{ itemId: string; error: string }> = [];
    const successes: Array<{ itemId: string; productId: string }> = [];

    try {
      for (let i = 0; i < items.length; i++) {
        const { id, card } = items[i];
        
        try {
          const result = await upsertItem(id, card);
          
          if (result.success) {
            successes.push({ 
              itemId: id, 
              productId: result.productId || '' 
            });
            
            if (result.alreadyPushed) {
              toast({
                title: "Already Synced",
                description: `Item ${i + 1} was already in Shopify`,
              });
            } else {
              toast({
                title: result.wasUpdate ? "Updated" : "Created",
                description: `Item ${i + 1} ${result.wasUpdate ? 'updated in' : 'added to'} Shopify`,
              });
            }
          } else {
            errors.push({ itemId: id, error: result.error || 'Unknown error' });
            toast({
              title: "Sync Failed",
              description: `Item ${i + 1}: ${result.error}`,
              variant: "destructive",
            });
          }
        } catch (itemError) {
          const errorMessage = itemError instanceof Error ? itemError.message : 'Unknown error';
          errors.push({ itemId: id, error: errorMessage });
          toast({
            title: "Sync Error",
            description: `Item ${i + 1}: ${errorMessage}`,
            variant: "destructive",
          });
        }

        setState(prev => ({
          ...prev,
          processed: i + 1,
          errors,
          successes
        }));
      }

      // Final summary toast
      const successCount = successes.length;
      const errorCount = errors.length;
      
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Sync Complete",
          description: `Successfully synced ${successCount} item(s) to Shopify`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Sync Partially Complete",
          description: `${successCount} successful, ${errorCount} failed`,
          variant: "destructive",
        });
      } else if (errorCount > 0) {
        toast({
          title: "Sync Failed",
          description: `All ${errorCount} item(s) failed to sync`,
          variant: "destructive",
        });
      }

    } finally {
      setState(prev => ({
        ...prev,
        processing: false
      }));
    }

    return { successes, errors };
  }, [upsertItem]);

  const retryFailed = useCallback(async (failedItems: Array<{ id: string; card: UpsertCard }>) => {
    toast({
      title: "Retrying Failed Items",
      description: `Attempting to sync ${failedItems.length} failed item(s)`,
    });

    return upsertBatch(failedItems);
  }, [upsertBatch]);

  const resetState = useCallback(() => {
    setState({
      processing: false,
      processed: 0,
      total: 0,
      errors: [],
      successes: []
    });
  }, []);

  return {
    ...state,
    upsertItem,
    upsertBatch,
    retryFailed,
    resetState
  };
}