import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import {
  buildOrderEmbed,
  getOrderType,
  getRegionDiscordConfig,
  type OrderType,
} from '../_shared/discord-helpers.ts';
import { isWithinBusinessHours } from '../_shared/business-hours.ts';

interface PendingNotification {
  id: number;
  payload: any;
  region_id: string;
  created_at: string;
}

/**
 * Flush pending Discord notifications by region.
 * Only sends notifications during business hours (default 8am-7pm).
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
      if (!byRegion[regionId]) byRegion[regionId] = [];
      byRegion[regionId].push(n as PendingNotification);
    }

    const results: Record<string, { sent: number; failed: number }> = {};
    const skippedRegions: string[] = [];

    for (const [regionId, regionNotifications] of Object.entries(byRegion)) {
      console.log(`[flush-pending-notifications] Processing ${regionNotifications.length} notifications for ${regionId}`);
      
      const { within, currentHour, timezone, day } = await isWithinBusinessHours(supabase, regionId);
      if (!within) {
        console.log(`[flush-pending-notifications] Outside business hours for ${regionId} (hour: ${currentHour}, day: ${day}, tz: ${timezone}), skipping`);
        skippedRegions.push(regionId);
        results[regionId] = { sent: 0, failed: 0 };
        continue;
      }
      
      // Use shared helper — no more hardcoded role IDs
      const config = await getRegionDiscordConfig(supabase, regionId);
      
      if (!config?.enabled || !config.webhookUrl) {
        console.warn(`[flush-pending-notifications] No Discord config for region ${regionId}, skipping`);
        results[regionId] = { sent: 0, failed: regionNotifications.length };
        continue;
      }

      results[regionId] = { sent: 0, failed: 0 };

      // Batch notifications (Discord supports up to 10 embeds per message)
      const batches: PendingNotification[][] = [];
      for (let i = 0; i < regionNotifications.length; i += 10) {
        batches.push(regionNotifications.slice(i, i + 10));
      }

      for (const batch of batches) {
        try {
          // Separate eBay pre-built embeds from regular Shopify order payloads
          const ebayEmbeds = batch.filter(n => n.payload?._ebay_embed);
          const regularOrders = batch.filter(n => !n.payload?._ebay_embed);
          
          const embeds: any[] = [];
          let mention = config.roleId ? `<@&${config.roleId}>\n` : '';
          
          // Add regular Shopify order embeds
          for (const n of regularOrders) {
            embeds.push(buildOrderEmbed(regionId, n.payload, getOrderType(n.payload)));
          }
          
          // Add pre-built eBay embeds
          for (const n of ebayEmbeds) {
            embeds.push(n.payload._ebay_embed);
            // Use eBay mention if available
            if (n.payload._ebay_mention) mention = n.payload._ebay_mention;
          }
          
          const header = `${mention}Queued orders ready for review (${batch.length})`;

          const discordResponse = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: header,
              embeds,
              allowed_mentions: { parse: ['roles'] },
            }),
          });

          if (!discordResponse.ok) {
            const errorText = await discordResponse.text();
            console.error(`[flush-pending-notifications] Discord error for batch (${batch.length}):`, discordResponse.status, errorText);
            results[regionId].failed += batch.length;
            continue;
          }

          const ids = batch.map((n) => n.id);
          await supabase
            .from('pending_notifications')
            .update({ sent: true })
            .in('id', ids);

          results[regionId].sent += batch.length;
          console.log(`[flush-pending-notifications] Sent batch: ${batch.length} notifications for ${regionId}`);

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`[flush-pending-notifications] Error sending batch for ${regionId}:`, error);
          results[regionId].failed += batch.length;
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
        byRegion: results,
        skippedOutsideHours: skippedRegions.length > 0,
        skippedRegions,
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
