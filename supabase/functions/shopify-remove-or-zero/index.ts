import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { fetchWithRetry } from "../_shared/http.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      storeKey,
      mode = 'auto', // 'graded' | 'raw' | 'auto'
      productId,
      variantId, 
      sku,
      locationGid
    } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }), 
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`Shopify removal request: ${JSON.stringify({ storeKey, mode, productId, variantId, sku, locationGid })}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Shopify credentials (support multiple key formats for compatibility)
    const upper = storeKey.toUpperCase();
    const domainKeys = [
      `SHOPIFY_${upper}_DOMAIN`,
      `SHOPIFY_STORE_DOMAIN_${storeKey}`,
      `SHOPIFY_${upper}_STORE_DOMAIN`,
    ];
    const tokenKeys = [
      `SHOPIFY_${upper}_ACCESS_TOKEN`,
      `SHOPIFY_ADMIN_ACCESS_TOKEN_${storeKey}`,
      `SHOPIFY_${upper}_ADMIN_ACCESS_TOKEN`,
    ];

    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('key_name,key_value')
      .in('key_name', [...domainKeys, ...tokenKeys]);

    if (settingsError) {
      console.error('Failed to read system_settings for Shopify credentials', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to read system settings for Shopify credentials' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const map = new Map<string, string>();
    (settings || []).forEach(s => map.set(s.key_name, s.key_value as string));
    const shopifyDomain = domainKeys.map(k => map.get(k)).find(Boolean);
    const accessToken = tokenKeys.map(k => map.get(k)).find(Boolean);

    if (!shopifyDomain || !accessToken) {
      console.error('Missing Shopify credentials', { tried: { domainKeys, tokenKeys }, found: Object.fromEntries(map) });
      return new Response(
        JSON.stringify({ error: 'Shopify credentials not found for store', tried: { domainKeys, tokenKeys } }), 
        { status: 400, headers: corsHeaders }
      );
    }

    const apiVersion = '2024-07';

    let resolvedProductId = productId;
    let resolvedMode = mode;

    // If we need to resolve product by SKU
    if (!resolvedProductId && sku) {
      console.log(`Resolving product by SKU: ${sku}`);
      const variantsUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/variants.json?limit=1&sku=${encodeURIComponent(sku)}`;
      
      const variantsResponse = await fetchWithRetry(variantsUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (variantsResponse.ok) {
        const variantsData = await variantsResponse.json();
        if (variantsData.variants && variantsData.variants.length > 0) {
          resolvedProductId = variantsData.variants[0].product_id.toString();
          console.log(`Resolved product ID: ${resolvedProductId}`);
        }
      }
    }

    if (!resolvedProductId) {
      return new Response(
        JSON.stringify({ error: 'Could not resolve product ID' }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Auto-determine mode if needed
    if (resolvedMode === 'auto') {
      console.log('Auto-determining mode from product tags...');
      
      const productUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
      const productResponse = await fetchWithRetry(productUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (productResponse.ok) {
        const productData = await productResponse.json();
        const productTags = (productData.product?.tags || '').toLowerCase();
        
        const gradedTags = ["graded", "professional sports authenticator (psa)", "psa"];
        const rawTags = ["single"];
        
        const isGraded = gradedTags.some(tag => productTags.includes(tag.toLowerCase()));
        const isRaw = rawTags.some(tag => productTags.includes(tag.toLowerCase()));
        
        if (isGraded) {
          resolvedMode = 'graded';
        } else if (isRaw) {
          resolvedMode = 'raw';
        } else {
          // Fallback: check local intake_items category
          console.log('Tags inconclusive, checking local category...');
          const { data: localItem } = await supabase
            .from('intake_items')
            .select('category')
            .eq('store_key', storeKey)
            .eq('shopify_product_id', resolvedProductId)
            .limit(1)
            .single();
            
          if (localItem?.category === 'graded') {
            resolvedMode = 'graded';
          } else if (localItem?.category === 'raw') {
            resolvedMode = 'raw';
          } else {
            resolvedMode = 'raw'; // Default fallback
          }
        }
      } else {
        console.warn('Could not fetch product for auto mode, defaulting to raw');
        resolvedMode = 'raw';
      }
    }

    console.log(`Final mode: ${resolvedMode}`);

    const actions: string[] = [];
    let success = true;

    if (resolvedMode === 'graded') {
      // DELETE the product from Shopify
      console.log(`Deleting product ${resolvedProductId} (graded)`);
      
      const deleteUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
      const deleteResponse = await fetchWithRetry(deleteUrl, {
        method: 'DELETE',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (deleteResponse.ok || deleteResponse.status === 404) {
        actions.push(`Deleted product ${resolvedProductId}`);
      } else {
        const errorText = await deleteResponse.text();
        actions.push(`Failed to delete product ${resolvedProductId}: ${deleteResponse.status} ${errorText}`);
        success = false;
      }
      
    } else if (resolvedMode === 'raw') {
      // ZERO out inventory levels for all locations
      console.log(`Zeroing inventory for product ${resolvedProductId} (raw)`);
      
      // Get all variants for the product
      const productUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
      const productResponse = await fetchWithRetry(productUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (productResponse.ok) {
        const productData = await productResponse.json();
        const variants = productData.product?.variants || [];
        
        for (const variant of variants) {
          if (!variant.inventory_item_id) continue;
          
          // Get inventory levels for this variant
          const levelsUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`;
          const levelsResponse = await fetchWithRetry(levelsUrl, {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          });

          if (levelsResponse.ok) {
            const levelsData = await levelsResponse.json();
            const inventoryLevels = levelsData.inventory_levels || [];
            
            for (const level of inventoryLevels) {
              // Filter by location if specified
              if (locationGid) {
                const levelLocationGid = `gid://shopify/Location/${level.location_id}`;
                if (levelLocationGid !== locationGid) continue;
              }
              
              // Set inventory to 0
              const setUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels/set.json`;
              const setResponse = await fetchWithRetry(setUrl, {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  location_id: level.location_id,
                  inventory_item_id: variant.inventory_item_id,
                  available: 0
                })
              });

              if (setResponse.ok || setResponse.status === 404) {
                actions.push(`Set inventory to 0 for variant ${variant.id} at location ${level.location_id}`);
              } else {
                const errorText = await setResponse.text();
                actions.push(`Failed to set inventory for variant ${variant.id}: ${setResponse.status} ${errorText}`);
                success = false;
              }
            }
          }
        }
      } else {
        actions.push(`Failed to fetch product details: ${productResponse.status}`);
        success = false;
      }
    }

    const result = {
      success,
      mode: resolvedMode,
      productId: resolvedProductId,
      actions,
      storeKey
    };

    console.log('Removal completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Removal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        success: false 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});