import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import {
  buildOrderEmbed,
  getOrderType,
  getRegionDiscordConfig,
  type OrderType,
} from '../_shared/discord-helpers.ts';

interface PendingNotification {
  id: number;
  payload: any;
  region_id: string;
  created_at: string;
}

// Default business hours for Discord notifications
const DEFAULT_BUSINESS_HOURS = { start: 8, end: 19 };

// Timezone mappings per region
const REGION_TIMEZONES: Record<string, string> = {
  hawaii: 'Pacific/Honolulu',
  las_vegas: 'America/Los_Angeles',
};

/**
 * Check if current time is within business hours for a region
 */
async function isWithinBusinessHours(supabase: any, regionId: string): Promise<{ within: boolean; currentHour: number; timezone: string }> {
  let timezone = REGION_TIMEZONES[regionId] || 'America/Los_Angeles';
  let start = DEFAULT_BUSINESS_HOURS.start;
  let end = DEFAULT_BUSINESS_HOURS.end;
  
  try {
    const { data: settings } = await supabase
      .from('region_settings')
      .select('setting_key, setting_value')
      .eq('region_id', regionId)
      .eq('setting_key', 'operations.business_hours')
      .single();
    
    if (settings?.setting_value) {
      const hours = settings.setting_value;
      if (hours.start !== undefined) start = hours.start;
      if (hours.end !== undefined) end = hours.end;
      if (hours.timezone) timezone = hours.timezone;
    }
  } catch (_e) {
    // Use defaults if fetch fails
  }
  
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour');
  const dayPart = parts.find(p => p.type === 'weekday');
  const currentHour = parseInt(hourPart?.value ?? '0', 10);
  const currentDay = dayPart?.value ?? '';
  
  if (currentDay === 'Sun') {
    return { within: false, currentHour, timezone };
  }
  
  const within = currentHour >= start && currentHour < end;
  return { within, currentHour, timezone };
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
      
      const { within, currentHour, timezone } = await isWithinBusinessHours(supabase, regionId);
      if (!within) {
        console.log(`[flush-pending-notifications] Outside business hours for ${regionId} (hour: ${currentHour}, tz: ${timezone}), skipping`);
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
          const embeds = batch.map((n) => buildOrderEmbed(regionId, n.payload, getOrderType(n.payload)));
          const mention = config.roleId ? `<@&${config.roleId}>\n` : '';
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
