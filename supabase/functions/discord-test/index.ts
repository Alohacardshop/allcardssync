import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import JsBarcode from 'https://esm.sh/jsbarcode@3.11.6';
import { createCanvas } from 'https://deno.land/x/canvas@v1.4.1/mod.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { channelName, payload = {} } = await req.json();

    if (!channelName) {
      throw new Error('channelName is required');
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

    // Find webhook URL for selected channel
    const channel = config.webhooks.channels.find((ch) => ch.name === channelName);
    if (!channel || !channel.webhook_url) {
      throw new Error(`Webhook URL not found for channel: ${channelName}`);
    }

    // Render message using immediate template
    const testPayload = {
      id: payload.id || 'TEST-12345',
      customer_name: payload.customer_name || 'Test Customer',
      total: payload.total || '$99.99',
      created_at: payload.created_at || new Date().toISOString(),
      tags: payload.tags || ['ebay', 'test'],
      raw_json: JSON.stringify(payload, null, 2).substring(0, 1800),
    };

    let message = config.templates.immediate;

    // Replace variables
    message = message.replace(/{id}/g, testPayload.id);
    message = message.replace(/{customer_name}/g, testPayload.customer_name);
    message = message.replace(/{total}/g, testPayload.total);
    message = message.replace(/{created_at}/g, testPayload.created_at);
    message = message.replace(/{tags}/g, JSON.stringify(testPayload.tags));
    message = message.replace(/{raw_json}/g, testPayload.raw_json);
    message = message.replace(/{role_id}/g, config.mention.role_id);

    // Remove mention line if disabled
    if (!config.mention.enabled) {
      message = message.split('\n').filter((line) => !line.includes('<@&')).join('\n');
    }

    // Generate barcode for order ID
    let barcodeBuffer: Uint8Array | null = null;
    try {
      const canvas = createCanvas(300, 100);
      JsBarcode(canvas, testPayload.id, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      barcodeBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    } catch (error) {
      console.warn('Failed to generate barcode:', error);
    }

    // Build FormData with message and barcode
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({
      content: `🧪 **TEST MESSAGE**\n\n${message}`,
      allowed_mentions: { parse: ['roles'] },
    }));

    if (barcodeBuffer) {
      const blob = new Blob([barcodeBuffer], { type: 'image/png' });
      formData.append('files[0]', blob, 'barcode.png');
    }

    const discordResponse = await fetch(channel.webhook_url, {
      method: 'POST',
      body: formData,
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Test message sent to Discord' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Discord test error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
