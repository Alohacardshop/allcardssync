import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ResyncParams {
  storeKey: string;
  locationGid?: string;
  itemIds?: string[];
}

interface ResyncResult {
  success: boolean;
  results: {
    total_checked: number;
    updated: number;
    unchanged: number;
    not_found: number;
    errors: number;
  };
  details: Array<{
    item_id: string;
    sku?: string;
    subject?: string;
    old_qty?: number;
    new_qty?: number;
    status: 'updated' | 'unchanged' | 'not_found' | 'error';
    error?: string;
  }>;
}

export function useShopifyResync() {
  const queryClient = useQueryClient();

  const resyncAll = useMutation({
    mutationFn: async ({ storeKey, locationGid }: ResyncParams) => {
      const { data, error } = await supabase.functions.invoke('shopify-resync-inventory', {
        body: { 
          store_key: storeKey, 
          location_gid: locationGid 
        }
      });

      if (error) throw error;
      return data as ResyncResult;
    },
    onSuccess: (data) => {
      const { results } = data;
      
      // Invalidate inventory queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });

      toast.success(`Synced ${results.total_checked} items from Shopify`, {
        description: `${results.updated} updated, ${results.unchanged} unchanged, ${results.not_found} removed${results.errors > 0 ? `, ${results.errors} errors` : ''}`
      });
    },
    onError: (error: Error) => {
      toast.error('Resync failed', {
        description: error.message
      });
    }
  });

  const resyncSelected = useMutation({
    mutationFn: async ({ storeKey, itemIds }: ResyncParams) => {
      if (!itemIds || itemIds.length === 0) {
        throw new Error('No items selected');
      }

      const { data, error } = await supabase.functions.invoke('shopify-resync-inventory', {
        body: { 
          store_key: storeKey, 
          item_ids: itemIds 
        }
      });

      if (error) throw error;
      return data as ResyncResult;
    },
    onSuccess: (data) => {
      const { results } = data;
      
      // Invalidate inventory queries
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });

      toast.success(`Synced ${results.total_checked} selected items`, {
        description: `${results.updated} updated, ${results.unchanged} unchanged${results.errors > 0 ? `, ${results.errors} errors` : ''}`
      });
    },
    onError: (error: Error) => {
      toast.error('Resync failed', {
        description: error.message
      });
    }
  });

  return {
    resyncAll,
    resyncSelected,
    isResyncing: resyncAll.isPending || resyncSelected.isPending
  };
}
