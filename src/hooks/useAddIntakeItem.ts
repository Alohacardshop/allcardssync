import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLogger } from '@/hooks/useLogger';
import { queryKeys } from '@/lib/queryKeys';

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

      // Check for duplicate SKU before attempting insert
      if (params.sku_in && params.store_key_in) {
        const { data: existing, error: queryError } = await supabase
          .from('intake_items')
          .select('id, quantity, sku, removed_from_batch_at, lot_id')
          .eq('sku', params.sku_in)
          .eq('store_key', params.store_key_in)
          .eq('type', 'Raw')
          .is('deleted_at', null)
          .maybeSingle();

        if (queryError) {
          logger.logError('Failed to check for duplicate SKU', queryError);
        }

        if (existing) {
          // Get or create active lot for current batch
          const { data: lotData, error: lotError } = await supabase
            .rpc('get_or_create_active_lot', {
              _store_key: params.store_key_in,
              _location_gid: params.shopify_location_gid_in
            });

          if (lotError) {
            logger.logError('Failed to get active lot', lotError);
            throw lotError;
          }

          const activeLotId = Array.isArray(lotData) ? lotData[0]?.id : (lotData as any)?.id;

          // Update existing item's quantity and move to current batch
          const newQuantity = (existing.quantity || 0) + (params.quantity_in || 1);
          
          const { error: updateError } = await supabase
            .from('intake_items')
            .update({ 
              quantity: newQuantity,
              lot_id: activeLotId, // Move to current batch
              removed_from_batch_at: null, // Clear any removal flag
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (updateError) {
            logger.logError('Failed to update existing item quantity', updateError);
            throw updateError;
          }

          logger.logInfo('Updated existing item and moved to current batch', { 
            id: existing.id, 
            sku: existing.sku,
            oldQuantity: existing.quantity,
            newQuantity,
            movedToLot: activeLotId
          });

          return {
            id: existing.id,
            lot_number: 'existing',
            lot_id: activeLotId,
            created_at: new Date().toISOString(),
            isDuplicate: true,
            oldQuantity: existing.quantity,
            newQuantity
          } as AddIntakeItemResponse;
        }
      }

      const { data, error } = await supabase.rpc('create_raw_intake_item', params);

      if (error) {
        // Check if this is a duplicate key constraint violation (race condition)
        const isDuplicateKeyError = error.message?.includes('duplicate key') || 
                                     error.message?.includes('uniq_active_sku_per_store');
        
        if (isDuplicateKeyError && params.sku_in && params.store_key_in) {
          logger.logInfo('Duplicate key constraint detected, updating existing item', { sku: params.sku_in });
          
          // Query for the existing item
          const { data: existing, error: queryError } = await supabase
            .from('intake_items')
            .select('id, quantity, sku, removed_from_batch_at, lot_id')
            .eq('sku', params.sku_in)
            .eq('store_key', params.store_key_in)
            .eq('type', 'Raw')
            .is('deleted_at', null)
            .maybeSingle();

          if (queryError) {
            logger.logError('Failed to query for duplicate item', queryError);
            throw queryError;
          }

          if (existing) {
            // Get or create active lot for current batch
            const { data: lotData, error: lotError } = await supabase
              .rpc('get_or_create_active_lot', {
                _store_key: params.store_key_in,
                _location_gid: params.shopify_location_gid_in
              });

            if (lotError) {
              logger.logError('Failed to get active lot', lotError);
              throw lotError;
            }

            const activeLotId = Array.isArray(lotData) ? lotData[0]?.id : (lotData as any)?.id;

            // Update existing item's quantity and move to current batch
            const newQuantity = (existing.quantity || 0) + (params.quantity_in || 1);
            
            const { error: updateError } = await supabase
              .from('intake_items')
              .update({ 
                quantity: newQuantity,
                lot_id: activeLotId, // Move to current batch
                removed_from_batch_at: null, // Clear any removal flag
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);

            if (updateError) {
              logger.logError('Failed to update existing item quantity', updateError);
              throw updateError;
            }

            logger.logInfo('Updated existing item quantity and moved to current batch', { 
              id: existing.id, 
              sku: existing.sku,
              oldQuantity: existing.quantity,
              newQuantity,
              movedToLot: activeLotId
            });

            return {
              id: existing.id,
              lot_number: 'existing',
              lot_id: activeLotId,
              created_at: new Date().toISOString(),
              isDuplicate: true,
              oldQuantity: existing.quantity,
              newQuantity
            } as AddIntakeItemResponse;
          }
        }
        
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

      // Show appropriate success message based on duplicate status
      if ((data as any).isDuplicate) {
        const oldQty = (data as any).oldQuantity || 0;
        const newQty = (data as any).newQuantity || 0;
        toast.success(`Quantity updated from ${oldQty} to ${newQty}`);
      } else {
        toast.success('Item added to batch successfully!');
      }
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
