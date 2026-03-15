import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import {
  buildOrderEmbed,
  getRegionDiscordConfig,
} from '../_shared/discord-helpers.ts';

/**
 * Send a test Discord notification with fake order data so admins
 * can preview what real notifications look like.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { regionId = 'hawaii', orderType = 'shipping' } = await req.json().catch(() => ({}));

    const config = await getRegionDiscordConfig(supabase, regionId);
    if (!config?.enabled || !config.webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, error: `Discord not configured or disabled for region "${regionId}"` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopDomain = regionId === 'las_vegas' ? 'vqvxdi-ar.myshopify.com' : 'aloha-card-shop.myshopify.com';

    // Fake order payload with realistic data
    const fakePayload: Record<string, any> = {
      id: '9999999999999',
      name: '#TEST-0001',
      created_at: new Date().toISOString(),
      total_price: '149.99',
      financial_status: 'paid',
      fulfillment_status: null,
      source_name: orderType === 'ebay' ? 'external' : 'web',
      tags: orderType === 'ebay' ? 'external_sale, ebay, needs_pull' : (orderType === 'pickup' ? 'local_pickup' : ''),
      customer: {
        first_name: 'Test',
        last_name: 'Customer',
      },
      line_items: [
        {
          title: '2024 Panini Prizm Justin Jefferson Silver /299',
          variant_title: 'Near Mint',
          sku: 'TEST-SKU-001',
          quantity: 1,
          price: '89.99',
          requires_shipping: true,
          image: {
            src: 'https://cdn.shopify.com/s/files/1/0877/1197/1151/files/panini-prizm-card.jpg',
          },
        },
        {
          title: '2023 Topps Chrome Shohei Ohtani Refractor',
          variant_title: 'PSA 10',
          sku: 'TEST-SKU-002',
          quantity: 1,
          price: '59.99',
          requires_shipping: true,
        },
      ],
      shop_domain: shopDomain,
    };

    // Add type-specific data
    if (orderType === 'shipping') {
      fakePayload.shipping_address = {
        city: 'Los Angeles',
        province_code: 'CA',
        country_code: 'US',
      };
      fakePayload.shipping_lines = [{ title: 'USPS Priority Mail', price: '8.99' }];
    } else if (orderType === 'pickup') {
      fakePayload.shipping_lines = [{ title: 'Store Pickup - Ward Ave' }];
    }

    const embed = buildOrderEmbed(regionId, fakePayload, orderType, shopDomain, '(TEST)');
    const mention = config.roleId ? `<@&${config.roleId}>\n` : '';

    const discordResponse = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${mention}🧪 **Test Notification** — This is a preview of how real order notifications look.`,
        embeds: [embed],
        allowed_mentions: { parse: ['roles'] },
      }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error('Discord test notification error:', discordResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Discord API error: ${discordResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, regionId, orderType, message: 'Test notification sent!' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Test notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
