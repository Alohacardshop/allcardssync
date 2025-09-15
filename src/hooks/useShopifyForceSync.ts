import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ForceSyncItem {
  id: string;
  sku: string;
  title?: string;
  quantity: number;
  price: number;
  currentShopifyStatus?: string;
  estimatedChanges: {
    willCreate: boolean;
    willUpdate: boolean;
    willDelete: boolean;
    changes: string[];
  };
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ForceSyncOptions {
  storeKey: string;
  locationGid: string;
  itemIds: string[];
  force?: boolean;
  dryRun?: boolean;
}

export function useShopifyForceSync() {
  const [loading, setLoading] = useState(false);
  const [dryRunResults, setDryRunResults] = useState<ForceSyncItem[]>([]);
  const [progress, setProgress] = useState(0);

  const runDryRun = useCallback(async (options: Omit<ForceSyncOptions, 'force'>) => {
    setLoading(true);
    setProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync-dry-run', {
        body: {
          storeKey: options.storeKey,
          locationGid: options.locationGid,
          itemIds: options.itemIds
        }
      });

      if (error) throw error;

      setDryRunResults(data.items || []);
      return {
        items: data.items || [],
        summary: data.summary
      };
    } catch (error: any) {
      console.error('Dry run failed:', error);
      toast.error(`Dry run failed: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const executeForceSync = useCallback(async (
    options: ForceSyncOptions,
    onProgress?: (progress: number) => void
  ) => {
    setLoading(true);
    setProgress(0);

    try {
      // Queue items for immediate processing with force flag
      const queuePromises = options.itemIds.map(async (itemId) => {
        const { error } = await supabase.rpc('queue_shopify_sync', {
          item_id: itemId,
          sync_action: 'create' // Will be determined by the processor
        });

        if (error) throw error;
      });

      await Promise.all(queuePromises);

      // Trigger the processor with force mode
      const { error: processorError } = await supabase.functions.invoke('shopify-sync-processor', {
        body: {
          force: options.force,
          itemIds: options.itemIds
        }
      });

      if (processorError) throw processorError;

      // Monitor progress
      const progressInterval = setInterval(async () => {
        try {
          const { data: queueStatus } = await supabase
            .from('shopify_sync_queue')
            .select('status, inventory_item_id')
            .in('inventory_item_id', options.itemIds);

          if (queueStatus && queueStatus.length > 0) {
            const completed = queueStatus.filter(item => 
              item.status === 'completed' || item.status === 'failed'
            ).length;
            
            const currentProgress = (completed / options.itemIds.length) * 100;
            setProgress(currentProgress);
            onProgress?.(currentProgress);

            if (currentProgress >= 100) {
              clearInterval(progressInterval);
              setLoading(false);
            }
          }
        } catch (error) {
          console.error('Error monitoring progress:', error);
        }
      }, 1000);

      // Cleanup interval after 30 seconds regardless
      setTimeout(() => {
        clearInterval(progressInterval);
        setLoading(false);
        setProgress(100);
      }, 30000);

      return { success: true };
    } catch (error: any) {
      console.error('Force sync failed:', error);
      toast.error(`Force sync failed: ${error.message}`);
      throw error;
    }
  }, []);

  const validateSyncReadiness = useCallback(async (itemIds: string[]) => {
    try {
      const { data: items, error } = await supabase
        .from('intake_items')
        .select('id, sku, store_key, shopify_location_gid, price, quantity, removed_from_batch_at')
        .in('id', itemIds);

      if (error) throw error;

      const validationResults = {
        valid: [] as string[],
        invalid: [] as { id: string; reason: string }[]
      };

      items?.forEach(item => {
        if (!item.sku) {
          validationResults.invalid.push({ id: item.id, reason: 'Missing SKU' });
        } else if (!item.store_key) {
          validationResults.invalid.push({ id: item.id, reason: 'Missing store key' });
        } else if (!item.shopify_location_gid) {
          validationResults.invalid.push({ id: item.id, reason: 'Missing location' });
        } else if (item.price === null || item.price < 0) {
          validationResults.invalid.push({ id: item.id, reason: 'Invalid price' });
        } else if (!item.removed_from_batch_at) {
          validationResults.invalid.push({ id: item.id, reason: 'Not in inventory yet' });
        } else {
          validationResults.valid.push(item.id);
        }
      });

      return validationResults;
    } catch (error: any) {
      console.error('Validation failed:', error);
      throw error;
    }
  }, []);

  const clearResults = useCallback(() => {
    setDryRunResults([]);
    setProgress(0);
  }, []);

  return {
    loading,
    progress,
    dryRunResults,
    runDryRun,
    executeForceSync,
    validateSyncReadiness,
    clearResults
  };
}