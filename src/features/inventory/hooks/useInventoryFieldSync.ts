import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { InventoryListItem } from '../types';
import { formatGrade } from '@/lib/labelData';

interface FieldUpdate {
  price?: number;
  subject?: string;
  brand_title?: string;
  card_number?: string;
  variant?: string;
  year?: string;
}

/**
 * Hook to update an inventory item's fields locally and sync to Shopify + eBay.
 * 
 * Flow:
 * 1. Update local DB (intake_items)
 * 2. If synced to Shopify → call shopify-update-product
 * 3. If listed on eBay → call ebay-update-inventory (price only)
 */
export function useInventoryFieldSync() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ item, updates }: { item: InventoryListItem; updates: FieldUpdate }) => {
      // 1. Update local DB
      const dbUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.price !== undefined) dbUpdate.price = updates.price;
      if (updates.subject !== undefined) dbUpdate.subject = updates.subject;
      if (updates.brand_title !== undefined) dbUpdate.brand_title = updates.brand_title;
      if (updates.card_number !== undefined) dbUpdate.card_number = updates.card_number;
      if (updates.variant !== undefined) dbUpdate.variant = updates.variant;
      if (updates.year !== undefined) dbUpdate.year = updates.year;

      const { error: dbError } = await supabase
        .from('intake_items')
        .update(dbUpdate)
        .eq('id', item.id);

      if (dbError) throw new Error(`Failed to save: ${dbError.message}`);

      const syncResults: { shopify?: boolean; ebay?: boolean } = {};

      // 2. Sync to Shopify if synced
      if (item.shopify_product_id && item.shopify_sync_status === 'synced' && item.store_key) {
        try {
          // Build title from updated fields
          const titleParts: string[] = [];
          const year = updates.year ?? item.year;
          const brand = updates.brand_title ?? item.brand_title;
          const subject = updates.subject ?? item.subject;
          const cardNum = updates.card_number ?? item.card_number;
          if (year) titleParts.push(year);
          if (brand) titleParts.push(brand);
          if (subject) titleParts.push(subject);
          if (cardNum) titleParts.push(`#${cardNum}`);
          if (item.grade && (item.psa_cert || item.cgc_cert)) {
            titleParts.push(`${item.grading_company || 'PSA'} ${formatGrade(item.grade)}`);
          }

          const shopifyUpdates: Record<string, unknown> = {};
          // Always send title if any name-related field changed
          if (updates.subject !== undefined || updates.brand_title !== undefined || 
              updates.card_number !== undefined || updates.year !== undefined) {
            shopifyUpdates.title = titleParts.join(' ') || 'Unknown Item';
          }
          if (updates.price !== undefined) {
            shopifyUpdates.price = updates.price;
          }

          if (Object.keys(shopifyUpdates).length > 0) {
            const { data, error } = await supabase.functions.invoke('shopify-update-product', {
              body: {
                itemId: item.id,
                storeKey: item.store_key,
                updates: shopifyUpdates,
              },
            });
            syncResults.shopify = !error && data?.synced;
            if (error || !data?.synced) {
              console.warn('Shopify sync failed:', error || data?.error);
            }
          }
        } catch (e) {
          console.warn('Shopify sync error:', e);
          syncResults.shopify = false;
        }
      }

      // 3. Sync price to eBay if listed
      if (updates.price !== undefined && item.ebay_listing_id && item.sku && item.store_key) {
        try {
          const { data, error } = await supabase.functions.invoke('ebay-update-inventory', {
            body: {
              sku: item.sku,
              quantity: item.quantity,
              store_key: item.store_key,
              price: updates.price,
            },
          });
          syncResults.ebay = !error && data?.success;
          if (error || !data?.success) {
            console.warn('eBay sync failed:', error || data?.error);
          }
        } catch (e) {
          console.warn('eBay sync error:', e);
          syncResults.ebay = false;
        }
      }

      return { updates, syncResults };
    },
    onSuccess: ({ syncResults }) => {
      const parts: string[] = ['Saved'];
      if (syncResults.shopify === true) parts.push('→ Shopify ✓');
      else if (syncResults.shopify === false) parts.push('→ Shopify ✗');
      if (syncResults.ebay === true) parts.push('→ eBay ✓');
      else if (syncResults.ebay === false) parts.push('→ eBay ✗');

      if (syncResults.shopify === false || syncResults.ebay === false) {
        toast.warning(parts.join(' '), { description: 'Local save succeeded but marketplace sync had issues.' });
      } else {
        toast.success(parts.join(' '));
      }

      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-item-detail'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const updateField = useCallback(
    (item: InventoryListItem, updates: FieldUpdate) => {
      mutation.mutate({ item, updates });
    },
    [mutation]
  );

  return {
    updateField,
    isSaving: mutation.isPending,
  };
}
