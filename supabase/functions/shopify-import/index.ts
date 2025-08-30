
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, storeKey } = await req.json();
    console.log(`Processing ${items.length} items for store ${storeKey}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Shopify credentials from system_settings
    const domainKey = `SHOPIFY_STORE_DOMAIN_${storeKey.toUpperCase()}`;
    const tokenKey = `SHOPIFY_ADMIN_ACCESS_TOKEN_${storeKey.toUpperCase()}`;
    
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', domainKey)
      .single();
      
    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', tokenKey)
      .single();

    if (!domainSetting?.key_value || !tokenSetting?.key_value) {
      throw new Error(`Store configuration not found for ${storeKey}. Missing domain or token in system_settings.`);
    }

    const shopifyUrl = `https://${domainSetting.key_value}/admin/api/2023-10/`;
    const headers = {
      'X-Shopify-Access-Token': tokenSetting.key_value,
      'Content-Type': 'application/json',
    };

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        console.log(`Processing item: ${item.subject || item.brand_title}`);
        
        // Create product payload
        const productData = {
          product: {
            title: item.subject || item.brand_title || 'Untitled Item',
            body_html: item.processing_notes || '',
            vendor: item.brand_title || 'Unknown',
            product_type: item.category || 'Trading Card',
            tags: [
              item.category,
              item.variant,
              item.grade,
              `lot-${item.lot_number}`,
              'intake'
            ].filter(Boolean).join(','),
            variants: [{
              title: 'Default Title',
              price: (item.price || 99999).toString(),
              sku: item.sku || `intake-${item.id}`,
              inventory_quantity: item.quantity || 1,
              inventory_management: 'shopify',
              inventory_policy: 'deny'
            }],
            status: 'draft'
          }
        };

        // Create product in Shopify
        const productResponse = await fetch(`${shopifyUrl}products.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify(productData),
        });

        if (!productResponse.ok) {
          const errorText = await productResponse.text();
          throw new Error(`Shopify API error: ${productResponse.status} - ${errorText}`);
        }

        const productResult = await productResponse.json();
        const productId = productResult.product.id;
        const variantId = productResult.product.variants[0].id;
        const inventoryItemId = productResult.product.variants[0].inventory_item_id;

        console.log(`Created product ${productId} with variant ${variantId}`);

        // Update inventory item cost if cost is provided
        if (item.cost && inventoryItemId) {
          try {
            const costUpdateResponse = await fetch(`${shopifyUrl}inventory_items/${inventoryItemId}.json`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                inventory_item: {
                  id: inventoryItemId,
                  cost: item.cost.toString()
                }
              }),
            });

            if (costUpdateResponse.ok) {
              console.log(`Updated cost for inventory item ${inventoryItemId}: $${item.cost}`);
            } else {
              const costErrorText = await costUpdateResponse.text();
              console.warn(`Failed to update cost for inventory item ${inventoryItemId}: ${costErrorText}`);
            }
          } catch (costError) {
            console.warn(`Error updating cost for item ${item.id}:`, costError);
            // Don't fail the import if cost update fails
          }
        }

        // Update intake item with Shopify IDs
        await supabase
          .from('intake_items')
          .update({
            pushed_at: new Date().toISOString(),
            shopify_product_id: productId.toString(),
            shopify_variant_id: variantId.toString(),
            shopify_inventory_item_id: inventoryItemId.toString()
          })
          .eq('id', item.id);

        results.push({
          item_id: item.id,
          success: true,
          shopify_product_id: productId,
          shopify_variant_id: variantId
        });

        successCount++;
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
        
        results.push({
          item_id: item.id,
          success: false,
          error: error.message
        });

        errorCount++;
      }
    }

    console.log(`Import completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: items.length,
          successful: successCount,
          failed: errorCount
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Shopify import error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
