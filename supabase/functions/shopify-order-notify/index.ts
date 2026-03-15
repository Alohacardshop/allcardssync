import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';

import {
  buildOrderEmbed,
  getOrderType,
  getRegionDiscordConfig,
  storeKeyToRegionId,
} from '../_shared/discord-helpers.ts';

/**
 * Manual Discord notification sender for any online order.
 * Routes to region-specific Discord channels via region_settings.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { orderNumber, storeKey } = await req.json();

    if (!orderNumber || !storeKey) {
      throw new Error('orderNumber and storeKey are required');
    }

    const regionId = storeKeyToRegionId(storeKey);

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase();
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single();

    const domain = domainSetting?.key_value;
    const token = tokenSetting?.key_value;

    if (!domain || !token) {
      throw new Error(`Shopify credentials not found for store: ${storeKey}`);
    }

    // Fetch order from Shopify
    const shopifyResponse = await fetch(
      `https://${domain}/admin/api/2024-07/orders.json?name=${encodeURIComponent(orderNumber)}`,
      {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!shopifyResponse.ok) {
      throw new Error(`Shopify API error: ${shopifyResponse.status}`);
    }

    const { orders } = await shopifyResponse.json();

    if (!orders || orders.length === 0) {
      throw new Error(`Order not found: ${orderNumber}`);
    }

    const order = orders[0];
    const orderType = getOrderType(order);

    // Load region-specific Discord config via shared helper
    const config = await getRegionDiscordConfig(supabase, regionId);

    if (!config?.enabled || !config.webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, message: `Discord not configured for region: ${regionId}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build rich embed using shared helper
    const embed = buildOrderEmbed(regionId, order, orderType, domain, '(Manual)');
    const mention = config.roleId ? `<@&${config.roleId}>\n` : '';

    const discordResponse = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${mention}📬 **MANUAL NOTIFICATION**`,
        embeds: [embed],
        allowed_mentions: { parse: ['roles'] },
      }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} ${errorText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notification sent to ${regionId} Discord channel`,
        orderNumber: order.name,
        region: regionId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Manual notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
