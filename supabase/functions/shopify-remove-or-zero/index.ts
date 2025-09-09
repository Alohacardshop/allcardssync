import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { fetchWithRetry } from "../_shared/http.ts";
import { resolveShopifyConfig } from "../_shared/resolveShopifyConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RemovalResult {
  ok: boolean;
  status: string;
  diagnostics: {
    storeKey: string;
    domain: string;
    ms: number;
  };
}

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication and admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user from JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has admin role
    const { data: roleData } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, code: "FORBIDDEN", message: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { storeKey, productId, sku, locationGid, mode = "delete", itemIds = [] } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ ok: false, code: "INVALID_INPUT", message: 'storeKey is required' }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`shopify-remove-or-zero: Processing removal for store ${storeKey}, SKU: ${sku}, productId: ${productId}`);

    // STEP 1: RESOLVE - Get Shopify credentials
    const configResult = await resolveShopifyConfig(supabase, storeKey);
    if (!configResult.ok) {
      return new Response(JSON.stringify(configResult), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { credentials, diagnostics } = configResult;
    const apiVersion = '2024-07';

    // STEP 2: RESOLVE - Get product and variant info if missing
    let resolvedProductId = productId;
    let resolvedVariantId: string | undefined;
    
    if (!resolvedProductId && sku) {
      console.log(`Resolving product by SKU: ${sku}`);
      
      // Use GraphQL to find variant by SKU
      const query = `
        query($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                product {
                  id
                  variants(first: 250) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetchWithRetry(`https://${credentials.domain}/admin/api/${apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { query: `sku:${sku}` }
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data?.productVariants?.edges?.length > 0) {
          const variant = result.data.productVariants.edges[0].node;
          resolvedVariantId = variant.id.split('/').pop(); // Extract numeric ID
          resolvedProductId = variant.product.id.split('/').pop(); // Extract numeric ID
          console.log(`Resolved via GraphQL - Product ID: ${resolvedProductId}, Variant ID: ${resolvedVariantId}`);
        }
      }
    }

    if (!resolvedProductId) {
      const result: RemovalResult = {
        ok: false,
        status: 'NOT_FOUND',
        diagnostics: {
          storeKey,
          domain: credentials.domain,
          ms: Date.now() - startTime
        }
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

    // STEP 3: DECIDE - Determine deletion strategy
    let variantCount = 1;
    
    // Get variant count for the product
    const productUrl = `https://${credentials.domain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
    const productResponse = await fetchWithRetry(productUrl, {
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (productResponse.ok) {
      const productData = await productResponse.json();
      variantCount = productData.product?.variants?.length || 1;
    } else if (productResponse.status === 404) {
      // Product already removed - idempotent success
      const result: RemovalResult = {
        ok: true,
        status: 'already_removed',
        diagnostics: {
          storeKey,
          domain: credentials.domain,
          ms: Date.now() - startTime
        }
      };

      // Update item status in DB
      if (itemIds.length > 0) {
        await supabase
          .from('intake_items')
          .update({
            shopify_removed_at: new Date().toISOString(),
            shopify_removal_mode: 'already_removed',
            shopify_product_id: null,
            shopify_variant_id: null,
            shopify_sync_status: 'removed',
            last_shopify_removal_error: null
          })
          .in('id', itemIds);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Product has ${variantCount} variants`);

    // STEP 4: DELETE - Execute the deletion strategy
    let deletionStrategy: 'product' | 'variant' | 'fallback_unpublish_zero';
    let success = false;

    try {
      if (variantCount === 1) {
        // Delete entire product if single variant
        deletionStrategy = 'product';
        const deleteUrl = `https://${credentials.domain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`;
        const deleteResponse = await fetchWithRetry(deleteUrl, {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
          },
        });

        if (deleteResponse.ok || deleteResponse.status === 404) {
          success = true;
          console.log(`Successfully deleted product ${resolvedProductId}`);

          // Update items in DB
          if (itemIds.length > 0) {
            await supabase
              .from('intake_items')
              .update({
                shopify_removed_at: new Date().toISOString(),
                shopify_removal_mode: 'product',
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_sync_status: 'removed',
                last_shopify_removal_error: null
              })
              .in('id', itemIds);
          }
        } else if (deleteResponse.status === 429 || deleteResponse.status >= 500) {
          throw new Error(`Rate limit/server error: ${deleteResponse.status}`);
        } else {
          throw new Error(`Delete failed: ${deleteResponse.status}`);
        }

      } else if (resolvedVariantId) {
        // Delete specific variant using GraphQL
        deletionStrategy = 'variant';
        
        const mutation = `
          mutation productVariantDelete($id: ID!) {
            productVariantDelete(id: $id) {
              deletedProductVariantId
              userErrors {
                field
                message
              }
            }
          }
        `;

        const mutationResponse = await fetchWithRetry(`https://${credentials.domain}/admin/api/${apiVersion}/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: mutation,
            variables: { id: `gid://shopify/ProductVariant/${resolvedVariantId}` }
          })
        });

        if (mutationResponse.ok) {
          const result = await mutationResponse.json();
          if (result.data?.productVariantDelete?.deletedProductVariantId || result.data?.productVariantDelete?.userErrors?.length === 0) {
            success = true;
            console.log(`Successfully deleted variant ${resolvedVariantId}`);

            // Update items in DB
            if (itemIds.length > 0) {
              await supabase
                .from('intake_items')
                .update({
                  shopify_removed_at: new Date().toISOString(),
                  shopify_removal_mode: 'variant',
                  shopify_variant_id: null,
                  shopify_sync_status: 'removed',
                  last_shopify_removal_error: null
                })
                .in('id', itemIds);
            }
          } else {
            throw new Error(`GraphQL variant deletion failed: ${JSON.stringify(result.data?.productVariantDelete?.userErrors)}`);
          }
        } else if (mutationResponse.status === 429 || mutationResponse.status >= 500) {
          throw new Error(`Rate limit/server error: ${mutationResponse.status}`);
        } else {
          throw new Error(`Variant delete failed: ${mutationResponse.status}`);
        }
      } else {
        throw new Error('Cannot delete variant: variant ID not resolved');
      }

    } catch (error) {
      console.log(`Deletion failed (${error.message}), falling back to unpublish + zero inventory`);
      
      // STEP 5: FALLBACK - Unpublish and zero inventory
      deletionStrategy = 'fallback_unpublish_zero';
      
      try {
        // Unpublish product
        const unpublishResponse = await fetchWithRetry(`https://${credentials.domain}/admin/api/${apiVersion}/products/${resolvedProductId}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product: {
              id: resolvedProductId,
              published: false
            }
          })
        });

        if (unpublishResponse.ok) {
          console.log(`Unpublished product ${resolvedProductId}`);
        }

        // Zero out inventory for all variants
        if (productResponse.ok) {
          const productData = await productResponse.json();
          const variants = productData.product?.variants || [];
          
          for (const variant of variants) {
            if (!variant.inventory_item_id) continue;
            
            // If we have a specific variant, only process that one
            if (resolvedVariantId && variant.id.toString() !== resolvedVariantId) continue;
            
            const levelsUrl = `https://${credentials.domain}/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`;
            const levelsResponse = await fetchWithRetry(levelsUrl, {
              headers: {
                'X-Shopify-Access-Token': credentials.accessToken,
              },
            });

            if (levelsResponse.ok) {
              const levelsData = await levelsResponse.json();
              const inventoryLevels = levelsData.inventory_levels || [];
              
              for (const level of inventoryLevels) {
                const setUrl = `https://${credentials.domain}/admin/api/${apiVersion}/inventory_levels/set.json`;
                await fetchWithRetry(setUrl, {
                  method: 'POST',
                  headers: {
                    'X-Shopify-Access-Token': credentials.accessToken,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    location_id: level.location_id,
                    inventory_item_id: variant.inventory_item_id,
                    available: 0
                  })
                });
                console.log(`Zeroed inventory for variant ${variant.id} at location ${level.location_id}`);
              }
            }
          }
        }

        success = true;

        // Update items in DB for fallback
        if (itemIds.length > 0) {
          await supabase
            .from('intake_items')
            .update({
              shopify_removed_at: new Date().toISOString(),
              shopify_removal_mode: 'fallback_unpublish_zero',
              shopify_sync_status: 'removed',
              last_shopify_removal_error: null
            })
            .in('id', itemIds);
        }

      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        
        // Update with error
        if (itemIds.length > 0) {
          await supabase
            .from('intake_items')
            .update({
              shopify_removal_mode: 'failed',
              last_shopify_removal_error: `Fallback failed: ${fallbackError.message}`,
              shopify_sync_status: 'error'
            })
            .in('id', itemIds);
        }

        return new Response(JSON.stringify({
          ok: false,
          code: 'SHOPIFY_ERROR',
          message: `Both deletion and fallback failed: ${fallbackError.message}`,
          diagnostics: {
            storeKey,
            domain: credentials.domain,
            ms: Date.now() - startTime
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const result: RemovalResult = {
      ok: success,
      status: deletionStrategy,
      diagnostics: {
        storeKey,
        domain: credentials.domain,
        ms: Date.now() - startTime
      }
    };

    console.log(`shopify-remove-or-zero: Completed removal - ${JSON.stringify(result)}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('shopify-remove-or-zero: Error -', error);
    return new Response(
      JSON.stringify({ 
        ok: false,
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unknown error occurred',
        diagnostics: {
          storeKey: 'unknown',
          domain: 'unknown',
          ms: Date.now() - startTime
        }
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});