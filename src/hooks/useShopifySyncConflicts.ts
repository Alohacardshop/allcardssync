import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface SyncConflict {
  itemId: string;
  sku: string;
  localData: {
    title?: string;
    price?: number;
    quantity?: number;
    lastUpdated?: string;
  };
  shopifyData: {
    productId?: string;
    variantId?: string;
    title?: string;
    price?: number;
    quantity?: number;
    lastUpdated?: string;
  };
  conflictType: 'price' | 'quantity' | 'title' | 'multiple';
  suggestions: Array<{
    action: 'use_local' | 'use_shopify' | 'manual_merge';
    description: string;
    impact: string;
  }>;
}

export function useShopifySyncConflicts() {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string[]>([]);

  const detectConflicts = useCallback(async (storeKey: string, itemIds?: string[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-detect-conflicts', {
        body: {
          storeKey,
          itemIds
        }
      });

      if (error) throw error;

      setConflicts(data.conflicts || []);
      return data.conflicts || [];
    } catch (error: any) {
      logger.error('Error detecting conflicts', error instanceof Error ? error : new Error(String(error)), { storeKey }, 'useShopifySyncConflicts')
      toast.error(`Failed to detect conflicts: ${error.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveConflict = useCallback(async (
    itemId: string, 
    resolution: 'use_local' | 'use_shopify' | 'manual_merge',
    mergeData?: any
  ) => {
    setResolving(prev => [...prev, itemId]);
    
    try {
      const { error } = await supabase.functions.invoke('shopify-resolve-conflict', {
        body: {
          itemId,
          resolution,
          mergeData
        }
      });

      if (error) throw error;

      // Remove resolved conflict from list
      setConflicts(prev => prev.filter(conflict => conflict.itemId !== itemId));
      
      toast.success('Conflict resolved successfully');
    } catch (error: any) {
      logger.error('Error resolving conflict', error instanceof Error ? error : new Error(String(error)), { itemId, resolution }, 'useShopifySyncConflicts')
      toast.error(`Failed to resolve conflict: ${error.message}`);
    } finally {
      setResolving(prev => prev.filter(id => id !== itemId));
    }
  }, []);

  const resolveAllConflicts = useCallback(async (
    resolution: 'use_local' | 'use_shopify'
  ) => {
    const allItemIds = conflicts.map(conflict => conflict.itemId);
    setResolving(allItemIds);

    try {
      const results = await Promise.allSettled(
        conflicts.map(conflict => 
          supabase.functions.invoke('shopify-resolve-conflict', {
            body: {
              itemId: conflict.itemId,
              resolution
            }
          })
        )
      );

      const succeeded = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        setConflicts([]);
        toast.success(`Resolved ${succeeded} conflicts`);
      }

      if (failed > 0) {
        toast.error(`Failed to resolve ${failed} conflicts`);
      }
    } catch (error: any) {
      logger.error('Error resolving all conflicts', error instanceof Error ? error : new Error(String(error)), { resolution, totalConflicts: conflicts.length }, 'useShopifySyncConflicts')
      toast.error('Failed to resolve conflicts');
    } finally {
      setResolving([]);
    }
  }, [conflicts]);

  return {
    conflicts,
    loading,
    resolving,
    detectConflicts,
    resolveConflict,
    resolveAllConflicts
  };
}