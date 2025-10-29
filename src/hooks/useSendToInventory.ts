import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

interface SendToInventoryVars {
  storeKey: string;
  locationGid: string;
  itemIds: string[];
}

interface RpcResult {
  processed: number;
  processed_ids: string[];
  rejected: Array<{ id: string; reason: string }>;
}

interface CurrentBatchData {
  items: any[];
  counts: {
    activeItems: number;
    totalItems: number;
  };
}

export function useSendToInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemIds }: SendToInventoryVars): Promise<RpcResult> => {
      const { data, error } = await supabase.rpc('send_and_queue_inventory' as any, { 
        item_ids: itemIds 
      });
      
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    
    onMutate: async ({ storeKey, locationGid, itemIds }) => {
      const queryKey = queryKeys.currentBatch(storeKey, locationGid);
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData<CurrentBatchData>(queryKey);
      
      // Optimistically update cache - remove items immediately
      queryClient.setQueryData<CurrentBatchData>(queryKey, (old) => {
        if (!old) return old;
        
        return {
          items: old.items.filter((item: any) => !itemIds.includes(item.id)),
          counts: {
            activeItems: old.counts.activeItems - itemIds.length,
            totalItems: old.counts.totalItems,
          },
        };
      });
      
      return { previousData, queryKey };
    },
    
    onError: (_error, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousData) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      
      toast.error('Failed to send items to inventory');
    },
    
    onSuccess: async (result, { storeKey, locationGid }) => {
      const queryKey = queryKeys.currentBatch(storeKey, locationGid);
      
      // Show partial failure warnings
      if (result.rejected && result.rejected.length > 0) {
        const firstReasons = result.rejected.slice(0, 3).map(r => r.reason).join(', ');
        toast.warning(
          `${result.rejected.length} item(s) failed to process: ${firstReasons}${
            result.rejected.length > 3 ? '...' : ''
          }`
        );
      }
      
      // Wait briefly then refresh from server to confirm final state
      await new Promise((resolve) => setTimeout(resolve, 120));
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
