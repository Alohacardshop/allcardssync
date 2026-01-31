import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';

interface RegionalDiscordConfig {
  webhookUrl: string | null;
  channelName: string | null;
  roleId: string | null;
  enabled: boolean;
}

interface PendingNotification {
  id: number;
  payload: any;
  region_id: string;
  created_at: string;
}

/**
 * Flush pending Discord notifications by region.
 * This function is called via cron job at 9:00 AM in each region's timezone.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[flush-pending-notifications] Starting flush...');

    // Fetch all unsent notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('sent', false)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch pending notifications:', fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      console.log('[flush-pending-notifications] No pending notifications');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending notifications', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[flush-pending-notifications] Found ${notifications.length} pending notifications`);

    // Group by region
    const byRegion: Record<string, PendingNotification[]> = {};
    for (const n of notifications) {
      const regionId = n.region_id || 'hawaii';
      if (!byRegion[regionId]) {
        byRegion[regionId] = [];
      }
      byRegion[regionId].push(n as PendingNotification);
    }

    const results: Record<string, { sent: number; failed: number }> = {};

    // Process each region
    for (const [regionId, regionNotifications] of Object.entries(byRegion)) {
      console.log(`[flush-pending-notifications] Processing ${regionNotifications.length} notifications for ${regionId}`);
      
      // Get region-specific Discord config
      const config = await getRegionDiscordConfig(supabase, regionId);
      
      if (!config?.enabled || !config.webhookUrl) {
        console.warn(`[flush-pending-notifications] No Discord config for region ${regionId}, skipping`);
        results[regionId] = { sent: 0, failed: regionNotifications.length };
        continue;
      }

      results[regionId] = { sent: 0, failed: 0 };

      // Send each notification
      for (const notification of regionNotifications) {
        try {
          const payload = notification.payload;
          const orderType = getOrderType(payload);
          
          // Build message with order type badge
          const regionIcon = regionId === 'hawaii' ? '🌺' : '🎰';
          const regionLabel = regionId === 'hawaii' ? 'Hawaii' : 'Las Vegas';
          const orderTypeBadge = orderType === 'ebay' ? '🏷️ **eBay ORDER**' 
                              : orderType === 'pickup' ? '📦 **PICKUP ORDER**' 
                              : '🛍️ **ONLINE ORDER**';
          
          const orderId = payload.id || payload.order_number || 'N/A';
          const orderName = payload.name || `#${orderId}`;
          const customerName = payload.customer?.first_name || payload.billing_address?.first_name || 'Customer';
          const totalPrice = payload.total_price || payload.current_total_price || 'N/A';
          
          let message = `${regionIcon} **${regionLabel}** | ${orderTypeBadge}\n`;
          message += `📋 **Order:** ${orderName}\n`;
          message += `👤 **Customer:** ${customerName}\n`;
          message += `💰 **Total:** $${totalPrice}\n`;
          
          // Add role mention if configured
          if (config.roleId) {
            message += `\n<@&${config.roleId}> New order needs attention!`;
          }

          // Send to Discord
          const discordResponse = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: message,
              allowed_mentions: { parse: ['roles'] },
            }),
          });

          if (!discordResponse.ok) {
            const errorText = await discordResponse.text();
            console.error(`[flush-pending-notifications] Discord error for notification ${notification.id}:`, discordResponse.status, errorText);
            results[regionId].failed++;
            continue;
          }

          // Mark as sent
          await supabase
            .from('pending_notifications')
            .update({ sent: true })
            .eq('id', notification.id);

          results[regionId].sent++;
          console.log(`[flush-pending-notifications] Sent notification ${notification.id} for order ${orderId}`);
          
          // Rate limit: wait 1 second between messages to avoid Discord rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`[flush-pending-notifications] Error sending notification ${notification.id}:`, error);
          results[regionId].failed++;
        }
      }
    }

    const totalSent = Object.values(results).reduce((acc, r) => acc + r.sent, 0);
    const totalFailed = Object.values(results).reduce((acc, r) => acc + r.failed, 0);

    console.log(`[flush-pending-notifications] Complete. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: totalSent, 
        failed: totalFailed,
        byRegion: results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[flush-pending-notifications] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getRegionDiscordConfig(supabase: any, regionId: string): Promise<RegionalDiscordConfig | null> {
  try {
    const { data: settings } = await supabase
      .from('region_settings')
      .select('setting_key, setting_value')
      .eq('region_id', regionId)
      .like('setting_key', 'discord.%');
    
    if (!settings || settings.length === 0) {
      return null;
    }
    
    return {
      webhookUrl: settings.find((s: any) => s.setting_key === 'discord.webhook_url')?.setting_value || null,
      channelName: settings.find((s: any) => s.setting_key === 'discord.channel_name')?.setting_value || null,
      roleId: settings.find((s: any) => s.setting_key === 'discord.role_id')?.setting_value || null,
      enabled: settings.find((s: any) => s.setting_key === 'discord.enabled')?.setting_value !== false,
    };
  } catch (error) {
    console.error('Error fetching region Discord config:', error);
    return null;
  }
}

function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  
  if (typeof tags === 'string') {
    return tags.toLowerCase().split(',').map((t: string) => t.trim()).includes('ebay');
  }
  
  if (Array.isArray(tags)) {
    return tags.some((tag: any) => tag.toString().toLowerCase().trim() === 'ebay');
  }
  
  return false;
}

function getOrderType(payload: any): 'shipping' | 'pickup' | 'ebay' {
  // Check for eBay tag first (highest priority)
  if (hasEbayTag(payload.tags)) {
    return 'ebay';
  }
  
  // Check for pickup indicators
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const hasPickupTag = tagString.includes('pickup') || tagString.includes('local_pickup') || tagString.includes('store_pickup');
  
  const fulfillments = payload.fulfillments || [];
  const hasPickupFulfillment = fulfillments.some((f: any) => 
    f.service === 'local_pickup' || 
    f.delivery_type === 'pickup' ||
    (f.name || '').toLowerCase().includes('pickup')
  );
  
  if (hasPickupTag || hasPickupFulfillment) {
    return 'pickup';
  }
  
  return 'shipping';
}
