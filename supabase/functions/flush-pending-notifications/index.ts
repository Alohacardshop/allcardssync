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

function getStoreLocation(payload: any): string {
  // Check shipping address state
  const shippingState = payload.shipping_address?.province || payload.shipping_address?.province_code || '';
  if (shippingState.toLowerCase().includes('hawaii') || shippingState.toLowerCase() === 'hi') {
    return '🌺 Hawaii';
  }
  if (shippingState.toLowerCase().includes('nevada') || shippingState.toLowerCase() === 'nv') {
    return '🎰 Las Vegas';
  }
  
  // Check billing address as fallback
  const billingState = payload.billing_address?.province || payload.billing_address?.province_code || '';
  if (billingState.toLowerCase().includes('hawaii') || billingState.toLowerCase() === 'hi') {
    return '🌺 Hawaii';
  }
  if (billingState.toLowerCase().includes('nevada') || billingState.toLowerCase() === 'nv') {
    return '🎰 Las Vegas';
  }
  
  // Default based on store domain if available
  const shopDomain = payload.shop_domain || payload.source_name || '';
  if (shopDomain.toLowerCase().includes('hawaii')) {
    return '🌺 Hawaii';
  }
  if (shopDomain.toLowerCase().includes('vegas') || shopDomain.toLowerCase().includes('las-vegas')) {
    return '🎰 Las Vegas';
  }
  
  // Default to Las Vegas if no match
  return '🎰 Las Vegas';
}

function renderMessage(template: string, payload: any, config: DiscordConfig): string {
  let message = template;

  // Replace variables
  message = message.replace(/{id}/g, payload.id || '');
  message = message.replace(/{customer_name}/g, payload.customer?.first_name || payload.customer_name || 'N/A');
  message = message.replace(/{total}/g, payload.total_price || payload.total || '');
  message = message.replace(/{created_at}/g, payload.created_at || '');
  message = message.replace(/{tags}/g, JSON.stringify(payload.tags || []));
  
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

    // Check for reset parameter
    const url = new URL(req.url);
    const shouldReset = url.searchParams.get('reset') === 'true';
    
    console.log('Reset parameter:', shouldReset, 'Full URL:', req.url);
    
    if (shouldReset) {
      console.log('Resetting all sent notifications...');
      const { data: resetData, error: resetError } = await supabase
        .from('pending_notifications')
        .update({ sent: false })
        .eq('sent', true)
        .select();
      
      if (resetError) {
        console.error('Reset error:', resetError);
      } else {
        console.log('Reset complete, affected rows:', resetData?.length || 0);
      }
    }

    console.log('Starting flush-pending-notifications...');

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

    // Find queued channel webhook
    const queuedChannel = config.webhooks.channels.find((ch) => ch.name === config.webhooks.queued_channel);
    if (!queuedChannel || !queuedChannel.webhook_url) {
      console.warn('No queued channel webhook configured');
      return new Response(
        JSON.stringify({ success: false, flushed: 0, message: 'No queued channel webhook configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get pending notifications
    const { data: pending, error: fetchError } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('sent', false)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    if (!pending || pending.length === 0) {
      console.log('No pending notifications to flush');
      return new Response(
        JSON.stringify({ success: true, flushed: 0, message: 'No pending notifications' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Flushing ${pending.length} notifications...`);

    let flushedCount = 0;
    const errors: string[] = [];

    for (const notification of pending) {
      try {
        const message = renderMessage(config.templates.queued, notification.payload, config);

        // Get store location
        const storeLocation = getStoreLocation(notification.payload);

        // Build embeds for line items with images
        const embeds = [];
        if (notification.payload.line_items && Array.isArray(notification.payload.line_items)) {
          for (const item of notification.payload.line_items.slice(0, 10)) { // Max 10 embeds
            const embed: any = {
              title: item.title || item.name || 'Product',
              fields: [
                { name: 'SKU', value: item.sku || 'N/A', inline: true },
                { name: 'Quantity', value: (item.quantity || 1).toString(), inline: true },
                { name: 'Price', value: `$${item.price || '0.00'}`, inline: true },
              ],
              color: 0x5865F2, // Discord blurple
              footer: {
                text: `Store: ${storeLocation}`
              }
            };
            
            // Add image as thumbnail for compact display
            if (item.image_url) {
              embed.thumbnail = { url: item.image_url };
            }
            
            embeds.push(embed);
          }
        }

        // Send to Discord
        const discordResponse = await fetch(queuedChannel.webhook_url, {
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
          throw new Error(`Discord API error: ${discordResponse.status} ${errorText}`);
        }

        // Mark as sent
        await supabase
          .from('pending_notifications')
          .update({ sent: true })
          .eq('id', notification.id);

        flushedCount++;
        console.log(`Flushed notification ${notification.id}`);
      } catch (error: any) {
        console.error(`Failed to flush notification ${notification.id}:`, error);
        errors.push(`ID ${notification.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        flushed: flushedCount,
        total: pending.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Flush error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
