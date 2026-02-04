import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';

const STALE_THRESHOLD_MINUTES = 60; // Alert if no webhooks for 60 minutes

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

// Map store_key to region_id
function storeKeyToRegion(storeKey: string): string {
  if (storeKey.includes('vegas') || storeKey.includes('lv')) return 'vegas';
  return 'hawaii'; // Default to Hawaii
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
        JSON.stringify({ success: true, message: 'All locations healthy', stale_locations: 0, alerted: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we already alerted recently (within last 30 minutes) to avoid spam
    const { data: recentAlerts } = await supabase
      .from('system_logs')
      .select('id')
      .eq('level', 'warn')
      .eq('source', 'check-webhook-health')
      .gte('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString())
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) {
      console.log('[check-webhook-health] Already alerted within last 30 minutes, skipping');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Stale locations detected but already alerted recently',
          stale_locations: staleLocations.length,
          alerted: false,
          skipped_reason: 'recent_alert_exists'
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

    for (const [regionId, regionStale] of byRegion.entries()) {
      if (dryRun) {
        console.log(`[check-webhook-health] DRY RUN: Would alert ${regionId} for ${regionStale.length} stale locations`);
        continue;
      }

      const config = await getRegionDiscordConfig(supabase, regionId);
      
      if (!config?.enabled || !config.webhookUrl) {
        console.warn(`[check-webhook-health] No Discord config for region ${regionId}`);
        continue;
      }

      const sent = await sendDiscordAlert(config.webhookUrl, regionStale);
      if (sent) {
        alertsSent++;
        
        // Log the alert for deduplication
        await supabase.from('system_logs').insert({
          level: 'warn',
          source: 'check-webhook-health',
          message: `Webhook health alert sent for ${regionStale.length} stale locations`,
          metadata: {
            region_id: regionId,
            stale_count: regionStale.length,
            locations: regionStale.map(l => l.location_name || l.location_gid || 'global'),
          }
        });
      }
    }

    console.log(`[check-webhook-health] Complete. Stale: ${staleLocations.length}, Alerts sent: ${alertsSent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stale_locations: staleLocations.length,
        alerted: alertsSent > 0,
        alerts_sent: alertsSent,
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
