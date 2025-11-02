import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import JsBarcode from 'https://esm.sh/jsbarcode@3.11.6';

interface DiscordConfig {
  webhooks: {
    channels: Array<{ name: string; webhook_url: string }>;
    immediate_channel: string;
    queued_channel: string;
  };
  mention: {
    enabled: boolean;
    role_id: string;
  };
  templates: {
    immediate: string;
    queued: string;
  };
}

function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  
  if (typeof tags === 'string') {
    return tags.toLowerCase().split(',').map((t) => t.trim()).includes('ebay');
  }
  
  if (Array.isArray(tags)) {
    return tags.some((tag) => tag.toString().toLowerCase().trim() === 'ebay');
  }
  
  return false;
}

function extractBarcodeNumber(payload: any): string {
  return payload.id?.toString() || payload.order_number?.toString() || payload.name || 'N/A';
}

function formatItemList(lineItems: any[]): string {
  if (!lineItems || lineItems.length === 0) return 'No items';
  
  return lineItems.map((item) => {
    const name = item.title || item.name || 'Unknown Item';
    const sku = item.sku ? ` - SKU: ${item.sku}` : '';
    const qty = item.quantity || 1;
    const price = item.price ? `$${item.price}` : 'N/A';
    return `• ${name}${sku} - Qty: ${qty} - ${price}`;
  }).join('\n');
}

function renderMessage(template: string, payload: any, config: DiscordConfig): string {
  let message = template;

  message = message.replace(/{id}/g, payload.id || payload.order_number || payload.name || '');
  message = message.replace(/{barcode_number}/g, extractBarcodeNumber(payload));
  message = message.replace(/{customer_name}/g, payload.customer?.first_name || payload.billing_address?.first_name || 'N/A');
  message = message.replace(/{total}/g, payload.total_price || payload.current_total_price || '');
  message = message.replace(/{created_at}/g, payload.created_at || '');
  message = message.replace(/{tags}/g, JSON.stringify(payload.tags || []));
  message = message.replace(/{item_list}/g, formatItemList(payload.line_items || []));
  
  const rawJson = JSON.stringify(payload, null, 2);
  message = message.replace(/{raw_json}/g, rawJson.substring(0, 1800) + (rawJson.length > 1800 ? '...' : ''));
  
  message = message.replace(/{role_id}/g, config.mention.role_id);

  if (!config.mention.enabled) {
    message = message.split('\n').filter((line) => !line.includes('<@&')).join('\n');
  }

  return message;
}

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

    // Check for eBay tag
    if (!hasEbayTag(order.tags)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Order does not have ebay tag' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load Discord config
    const { data: settings, error: configError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['discord.webhooks', 'discord.mention', 'discord.templates']);

    if (configError) throw configError;

    const config: DiscordConfig = {
      webhooks: settings?.find((s) => s.key === 'discord.webhooks')?.value || { channels: [], immediate_channel: '', queued_channel: '' },
      mention: settings?.find((s) => s.key === 'discord.mention')?.value || { enabled: false, role_id: '' },
      templates: settings?.find((s) => s.key === 'discord.templates')?.value || { immediate: '', queued: '' },
    };

    const immediateChannel = config.webhooks.channels.find((ch) => ch.name === config.webhooks.immediate_channel);
    
    if (!immediateChannel || !immediateChannel.webhook_url) {
      throw new Error('No immediate channel webhook configured');
    }

    const message = renderMessage(config.templates.immediate, order, config);

    // Generate barcode SVG
    let barcodeSvg: string | null = null;
    const barcodeNumber = extractBarcodeNumber(order);
    try {
      const orderId = order.id?.toString() || order.order_number?.toString() || order.name || 'NO-ID';
      const svg = JsBarcode(orderId, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        xmlDocument: true,
      });
      barcodeSvg = svg;
    } catch (error) {
      console.warn('Failed to generate barcode:', error);
    }

    // Build embeds for line items with images
    const embeds = [];
    if (order.line_items && Array.isArray(order.line_items)) {
      for (const item of order.line_items.slice(0, 10)) { // Max 10 embeds
        const embed: any = {
          title: item.title || item.name || 'Product',
          fields: [
            { name: '🔢 Barcode', value: `\`${barcodeNumber}\``, inline: false },
            { name: 'SKU', value: item.sku || 'N/A', inline: true },
            { name: 'Quantity', value: (item.quantity || 1).toString(), inline: true },
            { name: 'Price', value: `$${item.price || '0.00'}`, inline: true },
          ],
          color: 0x5865F2, // Discord blurple
        };
        
        // Add image as main image (large display) if available
        if (item.image_url) {
          embed.image = { url: item.image_url };
        }
        
        embeds.push(embed);
      }
    }

    // Send to Discord
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({
      content: `📦 **MANUAL NOTIFICATION**\n\n${message}`,
      embeds: embeds.length > 0 ? embeds : undefined,
      allowed_mentions: { parse: ['roles'] },
    }));

    if (barcodeSvg) {
      const svgBlob = new Blob([barcodeSvg], { type: 'image/svg+xml' });
      formData.append('files[0]', svgBlob, 'barcode.svg');
    }

    const discordResponse = await fetch(immediateChannel.webhook_url, {
      method: 'POST',
      body: formData,
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} ${errorText}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notification sent to Discord',
        orderNumber: order.name,
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
