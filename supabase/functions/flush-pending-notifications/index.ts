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

type OrderType = 'shipping' | 'pickup' | 'ebay';

function safeString(v: unknown, fallback = 'N/A'): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const str = String(value).trim();
  // If already includes currency/letters, leave as-is (e.g. "80.65 USD").
  if (/[a-zA-Z]/.test(str)) return str;
  const num = Number(str);
  if (!Number.isFinite(num)) return str;
  return `$${num.toFixed(2)}`;
}

function extractCustomerName(payload: any): string {
  return (
    payload?.customer_name ||
    payload?.customer?.first_name ||
    payload?.billing_address?.first_name ||
    payload?.customer?.name ||
    payload?.billing_address?.name ||
    'Customer'
  );
}

function extractOrderId(payload: any): string {
  return safeString(payload?.id || payload?.order_number || payload?.name, 'N/A');
}

function extractOrderName(payload: any): string {
  const id = extractOrderId(payload);
  return safeString(payload?.name, id.startsWith('#') ? id : `#${id}`);
}

function extractLineItemsSummary(payload: any): string | null {
  const items = payload?.line_items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const lines: string[] = [];
  for (const item of items.slice(0, 6)) {
    const title = safeString(item?.title || item?.name, 'Item');
    const qty = Number(item?.quantity ?? 1);
    const sku = item?.sku ? ` (SKU ${String(item.sku)})` : '';
    lines.push(`• ${title} x${Number.isFinite(qty) ? qty : 1}${sku}`);
  }

  const more = items.length > 6 ? `\n… +${items.length - 6} more` : '';
  const out = lines.join('\n') + more;
  // Discord field values max 1024 chars.
  return out.length > 1024 ? out.slice(0, 1021) + '…' : out;
}

function orderTypeLabel(orderType: OrderType): string {
  if (orderType === 'ebay') return '🏷️ eBay ORDER';
  if (orderType === 'pickup') return '📦 PICKUP ORDER';
  return '🛍️ ONLINE ORDER';
}

function regionMeta(regionId: string) {
  return regionId === 'hawaii'
    ? { icon: '🌺', label: 'Hawaii' }
    : { icon: '🎰', label: 'Las Vegas' };
}

function buildOrderEmbed(regionId: string, payload: any, orderType: OrderType) {
  const { icon, label } = regionMeta(regionId);
  const orderName = extractOrderName(payload);
  const orderId = extractOrderId(payload);
  const customerName = extractCustomerName(payload);
  const total = formatMoney(payload?.total_price || payload?.current_total_price || payload?.total);
  const items = extractLineItemsSummary(payload);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Customer', value: safeString(customerName), inline: true },
    { name: 'Total', value: safeString(total), inline: true },
  ];
  if (items) fields.push({ name: 'Items', value: items, inline: false });

  // Basic Shopify admin link if we have a numeric order id and a known shop domain.
  const shopDomain = payload?.shop_domain || payload?.source_name;
  const numericId = String(payload?.id || '').match(/^\d+$/) ? String(payload.id) : null;
  const url = shopDomain && numericId ? `https://${shopDomain}/admin/orders/${numericId}` : undefined;

  return {
    title: `${icon} ${label} • ${orderTypeLabel(orderType)}`,
    description: `**Order:** ${orderName}${orderId && orderName !== orderId ? `\n**Order ID:** ${orderId}` : ''}`,
    color: 0x5865F2,
    url,
    fields,
    timestamp: new Date().toISOString(),
  };
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

      // Batch notifications into a small number of Discord messages (less spam).
      // Discord supports up to 10 embeds per message.
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

          // Mark batch as sent
          const ids = batch.map((n) => n.id);
          await supabase
            .from('pending_notifications')
            .update({ sent: true })
            .in('id', ids);

          results[regionId].sent += batch.length;
          console.log(`[flush-pending-notifications] Sent batch: ${batch.length} notifications for ${regionId}`);

          // Rate limit: wait 1 second between messages
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

// Hard-coded role IDs per region (no DB lookup needed)
const HARDCODED_ROLE_IDS: Record<string, string> = {
  hawaii: '852989670496272394',
};

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
    
    // Use hard-coded role ID for Hawaii, otherwise fall back to DB
    const roleId = HARDCODED_ROLE_IDS[regionId] 
      || settings.find((s: any) => s.setting_key === 'discord.role_id')?.setting_value 
      || null;
    
    return {
      webhookUrl: settings.find((s: any) => s.setting_key === 'discord.webhook_url')?.setting_value || null,
      channelName: settings.find((s: any) => s.setting_key === 'discord.channel_name')?.setting_value || null,
      roleId,
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
