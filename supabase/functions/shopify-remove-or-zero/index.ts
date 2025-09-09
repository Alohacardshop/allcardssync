import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { fetchWithRetry } from "../_shared/http.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RemovalResult {
  success: boolean;
  status: string;
  productId?: string;
  variantId?: string;
  actions: string[];
  storeKey: string;
  mode: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication and admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create service client for auth check
    const authClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT token
    const { data: { user }, error: userError } = await authClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has admin role
    const { data: roleData } = await authClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      storeKey,
      productId,
      variantId, 
      sku,
      locationGid,
      itemIds = []
    } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }), 
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`Shopify removal request: ${JSON.stringify({ storeKey, productId, variantId, sku, locationGid, itemIds })}`);

    // Use service client
    const supabase = authClient;

    // Get removal strategy setting
    const { data: strategyData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', 'SHOPIFY_REMOVAL_STRATEGY')
      .single();

    const removalStrategy = strategyData?.key_value || 'delete';

    // Get Shopify credentials
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

    // STEP 1: RESOLVE - Get product and variant info
    let resolvedProductId = productId;
    let resolvedVariantId = variantId;
    
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
          const variant = variantsData.variants[0];
          resolvedProductId = variant.product_id.toString();
          resolvedVariantId = variant.id.toString();
          console.log(`Resolved product ID: ${resolvedProductId}, variant ID: ${resolvedVariantId}`);
        }
      }
    }

    if (!resolvedProductId) {
      const result: RemovalResult = {
        success: false,
        status: 'resolution_failed',
        actions: ['Could not resolve product ID from SKU'],
        storeKey,
        mode: 'failed',
        error: 'Could not resolve product ID'
      };

      // Update item status in DB
      if (itemIds.length > 0) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removal_mode: 'failed',
            last_shopify_removal_error: 'Could not resolve product ID',
            shopify_sync_status: 'error'
          })
          .in('id', itemIds);
      }

      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get product details to determine variant count
    const productUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
    const productResponse = await fetchWithRetry(productUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!productResponse.ok) {
      if (productResponse.status === 404) {
        // Product already removed - idempotent success
        const result: RemovalResult = {
          success: true,
          status: 'already_removed',
          productId: resolvedProductId,
          actions: ['Product already removed from Shopify'],
          storeKey,
          mode: 'idempotent'
        };

        // Update item status in DB
        if (itemIds.length > 0) {
          await supabase
            .from('intake_items')
            .update({
              shopify_removed_at: new Date().toISOString(),
              shopify_removal_mode: 'already_removed',
              shopify_product_id: null,
              shopify_sync_status: 'synced'
            })
            .in('id', itemIds);
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Other errors - try fallback
      return await handleFallback(
        supabase, shopifyDomain, accessToken, apiVersion,
        resolvedProductId, resolvedVariantId, storeKey, itemIds,
        `Failed to fetch product: ${productResponse.status}`
      );
    }

    const productData = await productResponse.json();
    const variants = productData.product?.variants || [];
    const variantCount = variants.length;

    console.log(`Product has ${variantCount} variants`);

    // STEP 2: DECIDE - Determine deletion strategy
    let deletionMode: 'product' | 'variant' | 'fallback';
    
    if (removalStrategy === 'zero') {
      deletionMode = 'fallback';
    } else if (variantCount === 1) {
      deletionMode = 'product'; // Delete entire product if single variant
    } else {
      deletionMode = 'variant'; // Delete specific variant if multiple variants
    }

    console.log(`Deletion mode: ${deletionMode}`);

    // STEP 3: DELETE - Execute the deletion
    const actions: string[] = [];
    let success = true;
    let status = '';

    try {
      if (deletionMode === 'product') {
        // Delete entire product
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
          status = 'product_deleted';

          // Update items in DB
          if (itemIds.length > 0) {
            await supabase
              .from('intake_items')
              .update({
                shopify_removed_at: new Date().toISOString(),
                shopify_removal_mode: 'product',
                shopify_product_id: null,
                shopify_sync_status: 'synced'
              })
              .in('id', itemIds);
          }
        } else if (deleteResponse.status === 429 || deleteResponse.status >= 500) {
          // Rate limit or server error - try fallback
          return await handleFallback(
            supabase, shopifyDomain, accessToken, apiVersion,
            resolvedProductId, resolvedVariantId, storeKey, itemIds,
            `Rate limit/server error: ${deleteResponse.status}`
          );
        } else {
          throw new Error(`Delete failed: ${deleteResponse.status} ${await deleteResponse.text()}`);
        }

      } else if (deletionMode === 'variant' && resolvedVariantId) {
        // Delete specific variant
        const deleteUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/variants/${resolvedVariantId}.json`;
        const deleteResponse = await fetchWithRetry(deleteUrl, {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (deleteResponse.ok || deleteResponse.status === 404) {
          actions.push(`Deleted variant ${resolvedVariantId} from product ${resolvedProductId}`);
          status = 'variant_deleted';

          // Update items in DB
          if (itemIds.length > 0) {
            await supabase
              .from('intake_items')
              .update({
                shopify_removed_at: new Date().toISOString(),
                shopify_removal_mode: 'variant',
                shopify_variant_id: null,
                shopify_sync_status: 'synced'
              })
              .in('id', itemIds);
          }
        } else if (deleteResponse.status === 429 || deleteResponse.status >= 500) {
          // Rate limit or server error - try fallback
          return await handleFallback(
            supabase, shopifyDomain, accessToken, apiVersion,
            resolvedProductId, resolvedVariantId, storeKey, itemIds,
            `Rate limit/server error: ${deleteResponse.status}`
          );
        } else {
          throw new Error(`Variant delete failed: ${deleteResponse.status} ${await deleteResponse.text()}`);
        }

      } else {
        // Fall back to unpublish + zero inventory
        return await handleFallback(
          supabase, shopifyDomain, accessToken, apiVersion,
          resolvedProductId, resolvedVariantId, storeKey, itemIds,
          'Using fallback strategy'
        );
      }

    } catch (error) {
      console.error('Deletion error:', error);
      // Try fallback on any deletion error
      return await handleFallback(
        supabase, shopifyDomain, accessToken, apiVersion,
        resolvedProductId, resolvedVariantId, storeKey, itemIds,
        `Deletion failed: ${error.message}`
      );
    }

    const result: RemovalResult = {
      success,
      status,
      productId: resolvedProductId,
      variantId: resolvedVariantId,
      actions,
      storeKey,
      mode: deletionMode
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

// STEP 4: FALLBACK - Unpublish and zero inventory
async function handleFallback(
  supabase: any,
  shopifyDomain: string,
  accessToken: string,
  apiVersion: string,
  productId: string,
  variantId: string | undefined,
  storeKey: string,
  itemIds: string[],
  reason: string
): Promise<Response> {
  console.log(`Executing fallback strategy: ${reason}`);
  
  const actions: string[] = [`Fallback: ${reason}`];
  
  try {
    // Unpublish product from all sales channels
    const unpublishUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${productId}.json`;
    const unpublishResponse = await fetchWithRetry(unpublishUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product: {
          id: productId,
          published: false
        }
      })
    });

    if (unpublishResponse.ok) {
      actions.push(`Unpublished product ${productId}`);
    } else {
      actions.push(`Failed to unpublish product: ${unpublishResponse.status}`);
    }

    // Zero out inventory for all variants
    const productUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/products/${productId}.json`;
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
        
        // If we have a specific variant ID, only process that one
        if (variantId && variant.id.toString() !== variantId) continue;
        
        // Get inventory levels
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

            if (setResponse.ok) {
              actions.push(`Set inventory to 0 for variant ${variant.id} at location ${level.location_id}`);
            }
          }
        }
      }
    }

    // Update items in DB
    if (itemIds.length > 0) {
      await supabase
        .from('intake_items')
        .update({
          shopify_removed_at: new Date().toISOString(),
          shopify_removal_mode: 'fallback_unpublish_zero',
          shopify_sync_status: 'synced'
        })
        .in('id', itemIds);
    }

    const result: RemovalResult = {
      success: true,
      status: 'fallback_unpublish_zero',
      productId,
      variantId,
      actions,
      storeKey,
      mode: 'fallback'
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fallback error:', error);

    // Update items with error
    if (itemIds.length > 0) {
      await supabase
        .from('intake_items')
        .update({
          shopify_removal_mode: 'failed',
          last_shopify_removal_error: `Fallback failed: ${error.message}`,
          shopify_sync_status: 'error'
        })
        .in('id', itemIds);
    }

    return new Response(
      JSON.stringify({
        success: false,
        status: 'fallback_failed',
        error: error.message,
        actions,
        storeKey,
        mode: 'failed'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
