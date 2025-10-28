import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole } from '../_shared/auth.ts'

/**
 * Test webhook handler for Shopify integration
 * 
 * This function helps test the complete webhook flow:
 * 1. Config verification
 * 2. Webhook sending with HMAC
 * 3. Metafield operations
 * 4. Location management
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication for test endpoint
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin', 'staff']);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, storeKey, payload } = await req.json();

    const results: any = {
      action,
      storeKey,
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Get store credentials
    const storeUpper = storeKey.toUpperCase();
    const { data: domainData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single();

    const { data: secretData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_WEBHOOK_SECRET`)
      .single();

    const domain = domainData?.key_value;
    const token = tokenData?.key_value;
    const webhookSecret = secretData?.key_value;

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for store: ${storeKey}`);
    }

    results.config = {
      domain,
      hasToken: !!token,
      hasWebhookSecret: !!webhookSecret
    };

    switch (action) {
      case 'verify-config':
        results.tests.push(await testConfigCheck(supabase, storeKey));
        results.tests.push(await testLocations(supabase, domain, token));
        break;

      case 'test-metafields':
        results.tests.push(await testMetafieldRead(domain, token));
        break;

      case 'test-webhook-send':
        results.tests.push(await testWebhookSend(supabaseUrl, payload, webhookSecret));
        break;

      case 'test-inventory-item':
        results.tests.push(await testInventoryItemLookup(supabase, storeKey, payload.sku));
        break;

      case 'full-integration-test':
        // Run all tests
        results.tests.push(await testConfigCheck(supabase, storeKey));
        results.tests.push(await testLocations(supabase, domain, token));
        results.tests.push(await testMetafieldRead(domain, token));
        results.tests.push(await testInventoryItemLookup(supabase, storeKey, payload?.sku || 'TEST-SKU'));
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(results, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function testConfigCheck(supabase: any, storeKey: string) {
  const test = {
    name: 'Config Check',
    status: 'running',
    details: {}
  };

  try {
    // Call shopify-config-check function
    const { data, error } = await supabase.functions.invoke('shopify-config-check', {
      body: { storeKey }
    });

    if (error) throw error;

    test.status = data.hasAdminToken && data.shop ? 'passed' : 'failed';
    test.details = {
      storeDomain: data.storeDomain,
      hasAdminToken: data.hasAdminToken,
      hasWebhookSecret: data.hasWebhookSecret,
      shopName: data.shop?.name,
      locationCount: data.locations?.length || 0
    };
  } catch (error) {
    test.status = 'failed';
    test.details = { error: error instanceof Error ? error.message : String(error) };
  }

  return test;
}

async function testLocations(supabase: any, domain: string, token: string) {
  const test = {
    name: 'Locations Fetch',
    status: 'running',
    details: {}
  };

  try {
    const response = await fetch(`https://${domain}/admin/api/2024-07/locations.json`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const locations = data.locations || [];

    test.status = locations.length > 0 ? 'passed' : 'failed';
    test.details = {
      count: locations.length,
      locations: locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        active: loc.active
      }))
    };
  } catch (error) {
    test.status = 'failed';
    test.details = { error: error instanceof Error ? error.message : String(error) };
  }

  return test;
}

async function testMetafieldRead(domain: string, token: string) {
  const test = {
    name: 'Metafield Definitions',
    status: 'running',
    details: {}
  };

  try {
    const query = `
      {
        metafieldDefinitions(first: 100, ownerType: PRODUCT) {
          edges {
            node {
              id
              name
              namespace
              key
              type {
                name
              }
            }
          }
        }
      }
    `;

    const response = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const definitions = data?.data?.metafieldDefinitions?.edges || [];
    const acsDefinitions = definitions.filter((edge: any) => 
      edge.node.namespace === 'acs.sync'
    );

    test.status = acsDefinitions.length >= 15 ? 'passed' : 'warning';
    test.details = {
      totalDefinitions: definitions.length,
      acsDefinitions: acsDefinitions.length,
      expectedAcsDefinitions: 18,
      definitions: acsDefinitions.map((edge: any) => ({
        name: edge.node.name,
        key: edge.node.key,
        type: edge.node.type.name
      }))
    };

    if (acsDefinitions.length < 18) {
      test.details.message = `Only ${acsDefinitions.length}/18 ACS metafield definitions found. Run shopify-create-metafield-definitions.`;
    }
  } catch (error) {
    test.status = 'failed';
    test.details = { error: error instanceof Error ? error.message : String(error) };
  }

  return test;
}

async function testWebhookSend(supabaseUrl: string, payload: any, webhookSecret: string | null) {
  const test = {
    name: 'Webhook Send Test',
    status: 'running',
    details: {}
  };

  try {
    const webhookUrl = `${supabaseUrl}/functions/v1/shopify-webhook`;
    const body = JSON.stringify(payload);

    // Calculate HMAC if secret provided
    let hmac = null;
    if (webhookSecret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'X-Shopify-Webhook-Id': `test-${Date.now()}`,
      'X-Shopify-Topic': payload.topic || 'products/update',
      'X-Shopify-Shop-Domain': payload.shop_domain || 'test-shop.myshopify.com'
    };

    if (hmac) {
      headers['X-Shopify-Hmac-Sha256'] = hmac;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body
    });

    const responseData = await response.json();

    test.status = response.ok ? 'passed' : 'failed';
    test.details = {
      statusCode: response.status,
      hmacSent: !!hmac,
      response: responseData
    };
  } catch (error) {
    test.status = 'failed';
    test.details = { error: error instanceof Error ? error.message : String(error) };
  }

  return test;
}

async function testInventoryItemLookup(supabase: any, storeKey: string, sku: string) {
  const test = {
    name: 'Inventory Item Lookup',
    status: 'running',
    details: {}
  };

  try {
    const { data: items, error } = await supabase
      .from('intake_items')
      .select('id, sku, type, quantity, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_location_gid')
      .eq('store_key', storeKey)
      .eq('sku', sku);

    if (error) throw error;

    test.status = items && items.length > 0 ? 'passed' : 'warning';
    test.details = {
      itemsFound: items?.length || 0,
      items: items?.map(item => ({
        id: item.id,
        sku: item.sku,
        type: item.type,
        quantity: item.quantity,
        hasShopifyProduct: !!item.shopify_product_id,
        hasShopifyVariant: !!item.shopify_variant_id,
        hasInventoryItem: !!item.shopify_inventory_item_id,
        hasLocation: !!item.shopify_location_gid
      }))
    };

    if (!items || items.length === 0) {
      test.details.message = 'No items found with this SKU. Test with an existing SKU from your inventory.';
    }
  } catch (error) {
    test.status = 'failed';
    test.details = { error: error instanceof Error ? error.message : String(error) };
  }

  return test;
}
