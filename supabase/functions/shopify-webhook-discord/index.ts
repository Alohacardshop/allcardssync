import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';

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

function isOpenNowInHawaii(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  return hour >= 9 && hour < 19;
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

  // Replace variables
  message = message.replace(/{id}/g, payload.id || payload.order_number || '');
  message = message.replace(/{barcode_number}/g, extractBarcodeNumber(payload));
  message = message.replace(/{customer_name}/g, payload.customer?.first_name || payload.billing_address?.first_name || 'N/A');
  message = message.replace(/{total}/g, payload.total_price || payload.current_total_price || '');
  message = message.replace(/{created_at}/g, payload.created_at || '');
  message = message.replace(/{tags}/g, JSON.stringify(payload.tags || []));
  message = message.replace(/{item_list}/g, formatItemList(payload.line_items || []));
  
  // Truncate raw_json to avoid Discord limits
  const rawJson = JSON.stringify(payload, null, 2);
  message = message.replace(/{raw_json}/g, rawJson.substring(0, 1800) + (rawJson.length > 1800 ? '...' : ''));
  
  message = message.replace(/{role_id}/g, config.mention.role_id);

  // Remove mention line if disabled
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

    const payload = await req.json();
    console.log('Shopify webhook received:', payload.id, payload.tags);

    // Check for eBay tag
    if (!hasEbayTag(payload.tags)) {
      console.log('Not an eBay order, ignoring');
      return new Response(
        JSON.stringify({ success: true, action: 'ignored', reason: 'not_ebay' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load config
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

    // Check business hours
    const isOpen = isOpenNowInHawaii();
    console.log('Business hours check:', isOpen ? 'OPEN' : 'CLOSED');

    if (isOpen) {
      // Send immediately
      const immediateChannel = config.webhooks.channels.find((ch) => ch.name === config.webhooks.immediate_channel);
      
      if (!immediateChannel || !immediateChannel.webhook_url) {
        console.warn('No immediate channel webhook configured');
        return new Response(
          JSON.stringify({ success: false, error: 'No immediate channel webhook configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const message = renderMessage(config.templates.immediate, payload, config);

      // Build embeds for line items with images
      const embeds = [];
      const barcodeNumber = extractBarcodeNumber(payload);
      
      if (payload.line_items && Array.isArray(payload.line_items)) {
        for (const item of payload.line_items.slice(0, 10)) { // Max 10 embeds
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
      const discordResponse = await fetch(immediateChannel.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          embeds: embeds.length > 0 ? embeds : undefined,
          allowed_mentions: { parse: ['roles'] },
        }),
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord API error:', discordResponse.status, errorText);
        
        // Fallback: queue if Discord fails
        console.log('Discord failed, queueing instead...');
        await supabase.from('pending_notifications').insert({ payload });
        
        return new Response(
          JSON.stringify({ success: true, action: 'queued', reason: 'discord_error' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Sent immediately to Discord');
      return new Response(
        JSON.stringify({ success: true, action: 'sent_now' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Queue for later
      // Check for duplicate
      const { data: existing } = await supabase
        .from('pending_notifications')
        .select('id')
        .eq('sent', false)
        .contains('payload', { id: payload.id })
        .limit(1);

      if (existing && existing.length > 0) {
        console.log('Duplicate order already queued');
        return new Response(
          JSON.stringify({ success: true, action: 'ignored', reason: 'duplicate' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.from('pending_notifications').insert({ payload });
      
      console.log('Queued for next business hours');
      return new Response(
        JSON.stringify({ success: true, action: 'queued' }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
