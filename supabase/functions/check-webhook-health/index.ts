import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';

const STALE_THRESHOLD_MINUTES = 60; // Alert if no webhooks for 60 minutes
 const ALERT_COOLDOWN_MINUTES = 30; // Don't re-alert same location within this window
 
 // Default business hours (8am-7pm)
 const DEFAULT_BUSINESS_HOURS = { start: 8, end: 19 };
 
 // Timezone mappings per region
 const REGION_TIMEZONES: Record<string, string> = {
   hawaii: 'Pacific/Honolulu',
   vegas: 'America/Los_Angeles',
 };

interface WebhookHealthRow {
  store_key: string;
  location_gid: string | null;
  topic: string;
  last_received_at: string | null;
  updated_at: string;
}

interface StaleLocation {
  store_key: string;
  location_gid: string | null;
  location_name: string | null;
  last_topic: string | null;
  last_received_at: string | null;
  minutes_since_last: number;
}

interface RegionalDiscordConfig {
  webhookUrl: string | null;
  enabled: boolean;
}

 interface WebhookHealthAlert {
   id: string;
   store_key: string;
   location_gid: string | null;
   alerted_at: string;
   resolved_at: string | null;
 }
 
// Map store_key to region_id
function storeKeyToRegion(storeKey: string): string {
  if (storeKey.includes('vegas') || storeKey.includes('lv')) return 'vegas';
  return 'hawaii'; // Default to Hawaii
}

 /**
  * Check if current time is within business hours for a region
  */
 async function isWithinBusinessHours(supabase: any, regionId: string): Promise<{ within: boolean; currentHour: number; dayOfWeek: string; timezone: string }> {
   let timezone = REGION_TIMEZONES[regionId] || 'America/Los_Angeles';
   let start = DEFAULT_BUSINESS_HOURS.start;
   let end = DEFAULT_BUSINESS_HOURS.end;
   
   try {
     // Try to get region-specific settings
     const { data: settings } = await supabase
       .from('region_settings')
       .select('setting_value')
       .eq('region_id', regionId)
       .eq('setting_key', 'operations.business_hours')
       .single();
     
     if (settings?.setting_value) {
       start = settings.setting_value.start ?? start;
       end = settings.setting_value.end ?? end;
       timezone = settings.setting_value.timezone ?? timezone;
     }
   } catch {
     // Use defaults
   }
   
   const now = new Date();
   const parts = new Intl.DateTimeFormat('en-US', {
     timeZone: timezone,
     hour: 'numeric',
     hour12: false,
     weekday: 'short',
   }).formatToParts(now);
   
   const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
   const dayOfWeek = parts.find(p => p.type === 'weekday')?.value || '';
   
   // Closed on Sundays
   if (dayOfWeek === 'Sun') {
     return { within: false, currentHour: hour, dayOfWeek, timezone };
   }
   
   const within = hour >= start && hour < end;
   return { within, currentHour: hour, dayOfWeek, timezone };
 }
 
 /**
  * Check if a specific store/location was recently alerted
  */
 async function wasRecentlyAlerted(
   supabase: any,
   storeKey: string,
   locationGid: string | null,
   cooldownMinutes: number
 ): Promise<boolean> {
   const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
   
   let query = supabase
     .from('webhook_health_alerts')
     .select('id')
     .eq('store_key', storeKey)
     .gte('alerted_at', cutoff)
     .is('resolved_at', null)
     .limit(1);
   
   if (locationGid) {
     query = query.eq('location_gid', locationGid);
   } else {
     query = query.is('location_gid', null);
   }
   
   const { data } = await query;
   return data && data.length > 0;
 }
 
 /**
  * Record that an alert was sent for a store/location
  */
 async function recordAlert(
   supabase: any,
   storeKey: string,
   locationGid: string | null,
   minutesSinceLast: number
 ): Promise<void> {
   await supabase.from('webhook_health_alerts').insert({
     store_key: storeKey,
     location_gid: locationGid,
     minutes_since_activity: minutesSinceLast,
   });
 }
 
 /**
  * Mark alerts as resolved when activity resumes
  */
 async function resolveStaleAlerts(supabase: any): Promise<number> {
   // Get active alerts
   const { data: activeAlerts } = await supabase
     .from('webhook_health_alerts')
     .select('id, store_key, location_gid')
     .is('resolved_at', null);
   
   if (!activeAlerts || activeAlerts.length === 0) return 0;
   
   // Check which ones have recent activity now
   const { data: healthData } = await supabase
     .from('webhook_health')
     .select('store_key, location_gid, last_received_at');
   
   const now = Date.now();
   const resolvedIds: string[] = [];
   
   for (const alert of activeAlerts) {
     const matching = healthData?.find((h: any) => 
       h.store_key === alert.store_key && 
       (h.location_gid === alert.location_gid || (!h.location_gid && !alert.location_gid))
     );
     
     if (matching?.last_received_at) {
       const lastReceived = new Date(matching.last_received_at).getTime();
       const minutesAgo = (now - lastReceived) / (1000 * 60);
       
       // If activity resumed (within threshold), mark as resolved
       if (minutesAgo < STALE_THRESHOLD_MINUTES) {
         resolvedIds.push(alert.id);
       }
     }
   }
   
   if (resolvedIds.length > 0) {
     await supabase
       .from('webhook_health_alerts')
       .update({ resolved_at: new Date().toISOString() })
       .in('id', resolvedIds);
   }
   
   return resolvedIds.length;
 }
 
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
      enabled: settings.find((s: any) => s.setting_key === 'discord.enabled')?.setting_value !== false,
    };
  } catch (error) {
    console.error('Error fetching region Discord config:', error);
    return null;
  }
}

async function sendDiscordAlert(webhookUrl: string, staleLocations: StaleLocation[]): Promise<boolean> {
  const locationLines = staleLocations.map(loc => {
    const name = loc.location_name || loc.location_gid || 'Global';
    const lastTopic = loc.last_topic || 'unknown';
    const lastTime = loc.last_received_at 
      ? new Date(loc.last_received_at).toLocaleString('en-US', { 
          timeZone: 'Pacific/Honolulu',
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })
      : 'Never';
    return `• **${name}** — last: \`${lastTopic}\` at ${lastTime} (${loc.minutes_since_last}min ago)`;
  });

  const embed = {
    title: '⚠️ Shopify Webhook Alert',
    description: `No webhook activity detected for **${staleLocations.length}** location(s) in the past ${STALE_THRESHOLD_MINUTES} minutes.\n\nThis may indicate:\n• Shopify webhook delivery issues\n• Network connectivity problems\n• Webhook registration has expired`,
    color: 0xF59E0B, // Amber warning color
    fields: [
      {
        name: '📍 Affected Locations',
        value: locationLines.join('\n').slice(0, 1024),
        inline: false,
      },
      {
        name: '🔧 Recommended Actions',
        value: '1. Check Shopify admin → Settings → Notifications → Webhooks\n2. Run "Register Webhooks" from Admin Dashboard\n3. Verify edge function logs for errors',
        inline: false,
      }
    ],
    footer: { text: 'Webhook Health Monitor' },
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '🚨 **Webhook Health Alert**',
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      console.error('Discord send failed:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Discord send error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional threshold override from request
    let thresholdMinutes = STALE_THRESHOLD_MINUTES;
    let dryRun = false;
    
    try {
      const body = await req.json();
      if (body.threshold_minutes) thresholdMinutes = body.threshold_minutes;
      if (body.dry_run) dryRun = body.dry_run;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[check-webhook-health] Checking for stale webhooks (threshold: ${thresholdMinutes}min, dryRun: ${dryRun})`);

     // First, resolve any alerts where activity has resumed
     const resolvedCount = await resolveStaleAlerts(supabase);
     if (resolvedCount > 0) {
       console.log(`[check-webhook-health] Resolved ${resolvedCount} stale alerts (activity resumed)`);
     }
 
    // Fetch webhook health data
    const { data: healthData, error: healthError } = await supabase
      .from('webhook_health')
      .select('store_key, location_gid, topic, last_received_at, updated_at')
      .order('last_received_at', { ascending: false });

    if (healthError) {
      console.error('Failed to fetch webhook health:', healthError);
      throw healthError;
    }

    if (!healthData || healthData.length === 0) {
      console.log('[check-webhook-health] No webhook health data found');
      return new Response(
        JSON.stringify({ success: true, message: 'No webhook health data', stale_locations: 0, alerted: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get location names for display
    const { data: locations } = await supabase
      .from('shopify_location_cache')
      .select('location_gid, location_name');

    const locationNameMap = new Map<string, string>();
    for (const loc of locations || []) {
      if (loc.location_gid && loc.location_name) {
        locationNameMap.set(loc.location_gid, loc.location_name);
      }
    }

    const now = new Date();

    // Group by store/location, find most recent activity
    const storeLocationMap = new Map<string, {
      store_key: string;
      location_gid: string | null;
      last_received_at: string | null;
      last_topic: string | null;
    }>();

    for (const row of healthData as WebhookHealthRow[]) {
      const key = `${row.store_key}|${row.location_gid || 'global'}`;
      const existing = storeLocationMap.get(key);
      const lastReceived = row.last_received_at ? new Date(row.last_received_at) : null;

      if (!existing || (lastReceived && (!existing.last_received_at || lastReceived > new Date(existing.last_received_at)))) {
        storeLocationMap.set(key, {
          store_key: row.store_key,
          location_gid: row.location_gid,
          last_received_at: row.last_received_at,
          last_topic: row.topic,
        });
      }
    }

    // Find stale locations
    const staleLocations: StaleLocation[] = [];

    for (const entry of storeLocationMap.values()) {
      const lastReceived = entry.last_received_at ? new Date(entry.last_received_at) : null;
      const minutesSinceLast = lastReceived 
        ? Math.floor((now.getTime() - lastReceived.getTime()) / (1000 * 60))
        : Infinity;

      if (minutesSinceLast > thresholdMinutes) {
        staleLocations.push({
          store_key: entry.store_key,
          location_gid: entry.location_gid,
          location_name: entry.location_gid ? locationNameMap.get(entry.location_gid) || null : null,
          last_topic: entry.last_topic,
          last_received_at: entry.last_received_at,
          minutes_since_last: minutesSinceLast === Infinity ? -1 : minutesSinceLast,
        });
      }
    }

    console.log(`[check-webhook-health] Found ${staleLocations.length} stale locations`);

    if (staleLocations.length === 0) {
      return new Response(
         JSON.stringify({ 
           success: true, 
           message: 'All locations healthy', 
           stale_locations: 0, 
           alerted: false,
           resolved_alerts: resolvedCount,
         }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group stale locations by region
    const byRegion = new Map<string, StaleLocation[]>();
    for (const loc of staleLocations) {
      const region = storeKeyToRegion(loc.store_key);
      const existing = byRegion.get(region) || [];
      existing.push(loc);
      byRegion.set(region, existing);
    }

    let alertsSent = 0;
     let skippedOutsideHours = 0;
     let skippedRecentlyAlerted = 0;

    for (const [regionId, regionStale] of byRegion.entries()) {
      if (dryRun) {
        console.log(`[check-webhook-health] DRY RUN: Would alert ${regionId} for ${regionStale.length} stale locations`);
        continue;
      }

       // Check if within business hours for this region
       const { within: isWithinHours, currentHour, dayOfWeek, timezone } = await isWithinBusinessHours(supabase, regionId);
       
       if (!isWithinHours) {
         console.log(`[check-webhook-health] Outside business hours for ${regionId} (hour: ${currentHour}, day: ${dayOfWeek}, tz: ${timezone}), skipping`);
         skippedOutsideHours += regionStale.length;
         continue;
       }
 
      const config = await getRegionDiscordConfig(supabase, regionId);
      
      if (!config?.enabled || !config.webhookUrl) {
        console.warn(`[check-webhook-health] No Discord config for region ${regionId}`);
        continue;
      }

       // Filter out locations that were recently alerted (per-location throttling)
       const locationsToAlert: StaleLocation[] = [];
       
       for (const loc of regionStale) {
         const recentlyAlerted = await wasRecentlyAlerted(
           supabase, 
           loc.store_key, 
           loc.location_gid, 
           ALERT_COOLDOWN_MINUTES
         );
        
         if (recentlyAlerted) {
           console.log(`[check-webhook-health] Skipping ${loc.location_name || loc.location_gid || 'global'} - already alerted recently`);
           skippedRecentlyAlerted++;
         } else {
           locationsToAlert.push(loc);
         }
       }
 
       if (locationsToAlert.length === 0) {
         console.log(`[check-webhook-health] All stale locations in ${regionId} were recently alerted, skipping`);
         continue;
       }
 
       const sent = await sendDiscordAlert(config.webhookUrl, locationsToAlert);
       if (sent) {
         alertsSent += locationsToAlert.length;
         
         // Record each alert for per-location throttling
         for (const loc of locationsToAlert) {
           await recordAlert(supabase, loc.store_key, loc.location_gid, loc.minutes_since_last);
         }
         
         // Also log to system_logs for audit trail
         await supabase.from('system_logs').insert({
           level: 'warn',
           source: 'check-webhook-health',
           message: `Webhook health alert sent for ${locationsToAlert.length} stale locations`,
           metadata: {
             region_id: regionId,
             stale_count: locationsToAlert.length,
             locations: locationsToAlert.map(l => l.location_name || l.location_gid || 'global'),
           }
         });
      }
    }

     console.log(`[check-webhook-health] Complete. Stale: ${staleLocations.length}, Alerts sent: ${alertsSent}, Skipped (hours): ${skippedOutsideHours}, Skipped (throttled): ${skippedRecentlyAlerted}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stale_locations: staleLocations.length,
        alerted: alertsSent > 0,
        alerts_sent: alertsSent,
         skipped_outside_hours: skippedOutsideHours,
         skipped_recently_alerted: skippedRecentlyAlerted,
         resolved_alerts: resolvedCount,
        dry_run: dryRun,
        details: staleLocations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[check-webhook-health] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
