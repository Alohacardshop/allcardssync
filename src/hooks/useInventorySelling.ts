import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface SellItemArgs {
  id: string;
  sku: string;
  type?: string;
  psa_cert?: string;
  grade?: string;
  quantity?: number;
  soldPrice?: number;
  orderId?: string;
}

export function useInventorySelling() {
  const [selling, setSelling] = useState(false);

  const sellItem = async ({
    id,
    sku,
    type,
    psa_cert,
    grade,
    quantity = 1,
    soldPrice,
    orderId
  }: SellItemArgs) => {
    setSelling(true);
    
    try {
      // Determine if item is raw or graded
      const itemType = type || (psa_cert || grade ? 'Graded' : 'Raw');
      
      logger.info(`Selling item`, { itemType, sku, quantity }, 'useInventorySelling')
      
      if (itemType === 'Raw') {
        // For raw cards, use the removal function which handles quantity reduction
        const { data, error } = await supabase.functions.invoke('v2-shopify-remove-raw', {
          body: {
            item_id: id,
            sku: sku,
            quantity: quantity
          }
        });
        
        if (error) {
          throw new Error(`Failed to process raw card sale: ${error.message}`);
        }
        
        if (!data?.ok) {
          throw new Error(`Failed to process raw card sale: ${data?.error || 'Unknown error'}`);
        }
        
        // Update local database with sale information
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            sold_price: soldPrice,
            sold_order_id: orderId,
            sold_channel: 'manual',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (updateError) {
          logger.warn('Failed to update sale details', { error: updateError, itemId: id }, 'useInventorySelling')
        }
        
        const action = data.action === 'quantity_reduced' ? 'reduced quantity' : 'completely sold';
        toast.success(`Raw card ${sku} ${action} successfully`);
        
      } else {
        // For graded cards, use the graded removal function
        const { data, error } = await supabase.functions.invoke('v2-shopify-remove-graded', {
          body: {
            item_id: id,
            sku: sku,
            certNumber: psa_cert,
            quantity: quantity
          }
        });
        
        if (error) {
          throw new Error(`Failed to process graded card sale: ${error.message}`);
        }
        
        if (!data?.ok) {
          throw new Error(`Failed to process graded card sale: ${data?.error || 'Unknown error'}`);
        }
        
        // Update local database with sale information
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({
            quantity: 0,
            sold_at: new Date().toISOString(),
            sold_price: soldPrice,
            sold_order_id: orderId,
            sold_channel: 'manual',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (updateError) {
          logger.warn('Failed to update sale details', { error: updateError, itemId: id }, 'useInventorySelling')
        }
        
        toast.success(`Graded card ${sku} sold successfully`);
      }
      
      return { success: true };
      
    } catch (error) {
      logger.error('Error selling item', error instanceof Error ? error : new Error(String(error)), { sku, id }, 'useInventorySelling')
      toast.error(`Failed to sell item: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      setSelling(false);
    }
  };

  return {
    sellItem,
    selling
  };
}