import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';
import { logInfo, logError } from '../_shared/log.ts';
import { resolveShopifyConfigForStore } from '../_shared/resolveShopifyConfig.ts';

interface ReconcileResult {
  checked: number;
  missing_in_shopify: number;
  cleaned: number;
  errors: number;
  missing_items: Array<{
    id: string;
    sku: string;
    shopify_product_id: string;
    action_taken: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { store_key, batch_size = 50, dry_run = false } = await req.json();

    if (!store_key) {
      throw new Error('store_key is required');
    }

    logInfo('shopify-reconcile', { store_key, batch_size, dry_run, user_id: user.id });

    // Get Shopify config
    const shopifyConfig = await resolveShopifyConfigForStore(supabase, store_key);
    if (!shopifyConfig) {
      throw new Error(`No Shopify config found for store: ${store_key}`);
    }

    const { shopDomain, accessToken } = shopifyConfig;

    // Query items that claim to have a Shopify product
    const { data: items, error: itemsError } = await supabase
      .from('intake_items')
      .select('id, sku, shopify_product_id, shopify_variant_id')
      .eq('store_key', store_key)
      .not('shopify_product_id', 'is', null)
      .is('deleted_at', null)
      .limit(batch_size);

    if (itemsError) {
      throw new Error(`Failed to fetch inventory items: ${itemsError.message}`);
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items with Shopify IDs found',
          result: {
            checked: 0,
            missing_in_shopify: 0,
            cleaned: 0,
            errors: 0,
            missing_items: [],
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result: ReconcileResult = {
      checked: items.length,
      missing_in_shopify: 0,
      cleaned: 0,
      errors: 0,
      missing_items: [],
    };

    // Check each item in Shopify
    for (const item of items) {
      try {
        const productId = item.shopify_product_id.replace('gid://shopify/Product/', '');
        
        const response = await fetch(
          `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
          {
            method: 'GET',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.status === 404) {
          // Product doesn't exist in Shopify
          result.missing_in_shopify++;
          
          let actionTaken = 'detected';
          
          if (!dry_run) {
            // Clear Shopify references from the item
            const { error: updateError } = await supabase
              .from('intake_items')
              .update({
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_inventory_item_id: null,
                shopify_sync_status: 'pending',
                last_shopify_sync_error: 'Product no longer exists in Shopify',
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            if (updateError) {
              logError('reconcile-update-failed', { item_id: item.id, error: updateError });
              result.errors++;
              actionTaken = 'error_cleaning';
            } else {
              result.cleaned++;
              actionTaken = 'cleaned';
              logInfo('reconcile-cleaned', { item_id: item.id, sku: item.sku });
            }
          }

          result.missing_items.push({
            id: item.id,
            sku: item.sku,
            shopify_product_id: item.shopify_product_id,
            action_taken: actionTaken,
          });
        } else if (!response.ok) {
          // Some other error (rate limit, auth, etc.)
          logError('reconcile-check-failed', {
            item_id: item.id,
            status: response.status,
            statusText: response.statusText,
          });
          result.errors++;
        }

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logError('reconcile-item-error', { item_id: item.id, error: error.message });
        result.errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: dry_run 
          ? `Dry run complete: found ${result.missing_in_shopify} orphaned items`
          : `Reconciliation complete: cleaned ${result.cleaned} orphaned items`,
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logError('shopify-reconcile-error', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});