import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLogger } from '@/hooks/useLogger';

interface AddIntakeItemParams {
  store_key_in: string | null;
  shopify_location_gid_in: string | null;
  quantity_in: number;
  brand_title_in?: string | null;
  subject_in?: string | null;
  category_in?: string | null;
  variant_in?: string | null;
  card_number_in?: string | null;
  grade_in?: string | null;
  price_in: number;
  cost_in?: number | null;
  sku_in?: string | null;
  source_provider_in?: string | null;
  main_category_in: string;
  sub_category_in?: string | null;
  catalog_snapshot_in?: any;
  pricing_snapshot_in?: any;
  processing_notes_in?: string | null;
}

interface AddIntakeItemResponse {
  id: string;
  lot_number: string;
  lot_id: string;
  created_at: string;
  [key: string]: any;
}

export const queryKeys = {
  currentBatch: (storeKey?: string | null, locationGid?: string | null) => 
    ['currentBatch', storeKey, locationGid].filter(Boolean),
};

interface MutationContext {
  previousItems: any;
  queryKey: any[];
}

export const useAddIntakeItem = () => {
  const queryClient = useQueryClient();
  const logger = useLogger('useAddIntakeItem');

  return useMutation<AddIntakeItemResponse, Error, AddIntakeItemParams, MutationContext>({
    mutationFn: async (params: AddIntakeItemParams) => {
      logger.logDebug('Creating intake item', { 
        store: params.store_key_in, 
        location: params.shopify_location_gid_in 
      });

      const { data, error } = await supabase.rpc('create_raw_intake_item', params);

      if (error) {
        logger.logError('Failed to create intake item', error);
        throw error;
      }

      // Handle array or single response
      const result = Array.isArray(data) ? data[0] : data;
      
      if (!result) {
        throw new Error('No data returned from create_raw_intake_item');
      }

      logger.logInfo('Intake item created successfully', { id: result.id });
      return result as AddIntakeItemResponse;
    },

    onMutate: async (newItem) => {
      const queryKey = queryKeys.currentBatch(
        newItem.store_key_in, 
        newItem.shopify_location_gid_in
      );

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousItems = queryClient.getQueryData(queryKey);

      // Optimistically update cache
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;

        const optimisticItem = {
          id: `temp-${Date.now()}`,
          ...newItem,
          created_at: new Date().toISOString(),
          _optimistic: true, // Mark as optimistic for UI handling
        };

        return {
          ...old,
          items: [optimisticItem, ...(old.items || [])],
          counts: {
            ...old.counts,
            activeItems: (old.counts?.activeItems || 0) + 1,
          },
        };
      });

      logger.logDebug('Optimistic update applied', { queryKey });

      return { previousItems, queryKey };
    },

    onSuccess: async (data, variables, context) => {
      logger.logInfo('Item created, triggering background refresh', { id: data.id });

      // Wait 150ms for DB commit/replication
      await new Promise(resolve => setTimeout(resolve, 150));

      // Invalidate to trigger background refetch
      if (context?.queryKey) {
        await queryClient.invalidateQueries({ queryKey: context.queryKey });
      }

      toast.success('Item added to batch successfully!');
    },

    onError: (error, variables, context) => {
      logger.logError('Failed to add item', error);

      // Rollback optimistic update
      if (context?.previousItems && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousItems);
      }

      toast.error(`Failed to add item: ${error.message}`);
    },
  });
};
