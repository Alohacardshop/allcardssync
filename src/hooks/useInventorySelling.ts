import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      
      console.log(`Selling ${itemType} item: ${sku} (quantity: ${quantity})`);
      
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
          console.warn('Failed to update sale details:', updateError);
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
          console.warn('Failed to update sale details:', updateError);
        }
        
        toast.success(`Graded card ${sku} sold successfully`);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('Error selling item:', error);
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