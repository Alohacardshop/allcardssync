import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function useEbayListing() {
  const [isCreating, setIsCreating] = useState(false);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const toggleListOnEbay = async (itemId: string, currentValue: boolean) => {
    setIsToggling(itemId);
    const enabling = !currentValue;
    try {
      // Update the flag + sync status together
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          list_on_ebay: enabling,
          ebay_sync_status: enabling ? 'queued' : null,
          ebay_sync_error: enabling ? null : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) throw error;

      if (enabling) {
        // Insert into sync queue so the cron picks it up
        const { error: queueError } = await supabase
          .from('ebay_sync_queue')
          .upsert({
            inventory_item_id: itemId,
            action: 'create',
            status: 'queued',
            queue_position: 1
          }, { onConflict: 'inventory_item_id' });

        if (queueError) throw queueError;

        // Immediately trigger the processor (don't await — fire and forget)
        supabase.functions.invoke('ebay-sync-processor', {
          body: { batch_size: 1 }
        }).catch(() => {}) // Silent fail — cron will retry
      } else {
        // Remove any pending queue entries
        await supabase
          .from('ebay_sync_queue')
          .delete()
          .eq('inventory_item_id', itemId)
          .in('status', ['queued', 'pending']);
      }

      toast.success(enabling ? 'Queued for eBay listing' : 'Removed from eBay listing');
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error('Failed to update eBay status: ' + error.message);
    } finally {
      setIsToggling(null);
    }
  };

  const createEbayListing = async (itemId: string, storeKey: string) => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-create-listing', {
        body: { intake_item_id: itemId, store_key: storeKey }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create listing');

      toast.success('eBay listing created!', {
        action: data.listing_url ? {
          label: 'View',
          onClick: () => window.open(data.listing_url, '_blank')
        } : undefined
      });

      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      return data;
    } catch (error: any) {
      toast.error('Failed to create eBay listing: ' + error.message);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  const bulkToggleEbay = async (itemIds: string[], enableEbay: boolean) => {
    try {
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          list_on_ebay: enableEbay,
          ebay_sync_status: enableEbay ? 'queued' : null,
          ebay_sync_error: enableEbay ? null : undefined,
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      if (error) throw error;

      if (enableEbay) {
        // Queue all items for eBay sync
        const queueRows = itemIds.map((id, i) => ({
          inventory_item_id: id,
          action: 'create' as const,
          status: 'queued' as const,
          queue_position: i + 1,
        }));

        await supabase
          .from('ebay_sync_queue')
          .upsert(queueRows, { onConflict: 'inventory_item_id' });

        // Smart batch size: scale with item count, cap at 25
        const batchSize = Math.min(Math.max(itemIds.length, 1), 25);
        supabase.functions.invoke('ebay-sync-processor', {
          body: { batch_size: batchSize }
        }).catch(() => {});
      }

      toast.success(`${itemIds.length} items ${enableEbay ? 'queued for' : 'removed from'} eBay`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error('Failed to update eBay status: ' + error.message);
    }
  };

  const queueForEbaySync = async (itemIds: string[], storeKey: string) => {
    try {
      // Queue items in ebay_sync_queue
      const queueItems = itemIds.map((id, index) => ({
        inventory_item_id: id,
        action: 'create',
        status: 'pending',
        queue_position: index + 1
      }));

      const { error } = await supabase
        .from('ebay_sync_queue')
        .insert(queueItems);

      if (error) throw error;

      // Update items to show they're queued
      await supabase
        .from('intake_items')
        .update({ 
          ebay_sync_status: 'queued',
          updated_at: new Date().toISOString()
        })
        .in('id', itemIds);

      toast.success(`${itemIds.length} items queued for eBay sync`);
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error('Failed to queue for eBay: ' + error.message);
    }
  };

  const updateEbayInventory = async (
    items: Array<{ sku: string; quantity: number; price?: number }>,
    storeKey: string
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('ebay-update-inventory', {
        body: { items, store_key: storeKey }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update inventory');

      if (data.succeeded > 0) {
        toast.success(`Updated ${data.succeeded} item(s) on eBay`);
      }
      if (data.failed > 0) {
        toast.error(`Failed to update ${data.failed} item(s)`);
      }

      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      return data;
    } catch (error: any) {
      toast.error('Failed to update eBay inventory: ' + error.message);
      throw error;
    }
  };

  const resyncToEbay = async (itemId: string) => {
    setIsResyncing(itemId);
    try {
      const { error: queueError } = await supabase
        .from('ebay_sync_queue')
        .upsert({
          inventory_item_id: itemId,
          action: 'update',
          status: 'queued',
          queue_position: 1,
          retry_count: 0,
          error_message: null,
        }, { onConflict: 'inventory_item_id' });

      if (queueError) throw queueError;

      await supabase
        .from('intake_items')
        .update({
          ebay_sync_status: 'queued',
          ebay_sync_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      supabase.functions.invoke('ebay-sync-processor', {
        body: { batch_size: 1 }
      }).catch(() => {});

      toast.success('Queued for eBay resync');
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error('Failed to queue eBay resync: ' + error.message);
    } finally {
      setIsResyncing(null);
    }
  };

  return {
    isCreating,
    isToggling,
    isResyncing,
    toggleListOnEbay,
    createEbayListing,
    bulkToggleEbay,
    queueForEbaySync,
    updateEbayInventory,
    resyncToEbay
  };
}
