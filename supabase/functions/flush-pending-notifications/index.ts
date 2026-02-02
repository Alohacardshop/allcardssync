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
  for (const item of items.slice(0, 8)) {
    const title = safeString(item?.title || item?.name, 'Item');
    const qty = Number(item?.quantity ?? 1);
    const price = item?.price ? formatMoney(item.price) : '';
    const lineTotal = item?.price ? formatMoney(Number(item.price) * qty) : '';
    const sku = item?.sku ? `\`${String(item.sku)}\`` : '';
    const variant = item?.variant_title ? `${item.variant_title}` : '';
    
    // Format: Title | Variant | SKU | Price × Qty = Total
    let line = `**${title}**`;
    if (variant) line += `\n   ${variant}`;
    if (sku) line += ` • ${sku}`;
    if (price && qty) line += `\n   ${price} × ${qty} = **${lineTotal}**`;
    
    lines.push(line);
  }

  const more = items.length > 8 ? `\n\n*… +${items.length - 8} more items*` : '';
  const out = lines.join('\n\n') + more;
  // Discord field values max 1024 chars.
  return out.length > 1024 ? out.slice(0, 1021) + '…' : out;
}

function extractPickupLocation(payload: any): string | null {
  // Check fulfillments for pickup location
  const fulfillments = payload?.fulfillments || [];
  for (const f of fulfillments) {
    if (f?.location?.name) return f.location.name;
    if (f?.origin_address?.company) return f.origin_address.company;
  }
  
  // Check shipping lines for pickup
  const shippingLines = payload?.shipping_lines || [];
  for (const s of shippingLines) {
    if (s?.title?.toLowerCase().includes('pickup')) {
      // Extract location from title like "Local Pickup - Ward Ave"
      const match = s.title.match(/pickup\s*[-–—]\s*(.+)/i);
      if (match) return match[1].trim();
    }
  }
  
  // Check tags for location hints
  const tags = payload?.tags || '';
  const tagStr = typeof tags === 'string' ? tags : tags.join(',');
  if (tagStr.toLowerCase().includes('ward')) return 'Ward Ave';
  if (tagStr.toLowerCase().includes('vegas') || tagStr.toLowerCase().includes('lv')) return 'Las Vegas';
  
  return null;
}

function extractExpectedDate(payload: any): string | null {
  // Check for expected delivery in fulfillments
  const fulfillments = payload?.fulfillments || [];
  for (const f of fulfillments) {
    if (f?.expected_delivery_at) {
      return new Date(f.expected_delivery_at).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }
  return null;
}

function getPaymentStatus(payload: any): { text: string; emoji: string } {
  const financial = payload?.financial_status?.toLowerCase() || '';
  if (financial === 'paid') return { text: 'Paid', emoji: '💰' };
  if (financial === 'pending') return { text: 'Pending', emoji: '⏳' };
  if (financial === 'refunded') return { text: 'Refunded', emoji: '↩️' };
  if (financial === 'partially_refunded') return { text: 'Partial Refund', emoji: '↩️' };
  return { text: 'Unpaid', emoji: '❌' };
}

function getFulfillmentStatus(payload: any): { text: string; emoji: string } {
  const status = payload?.fulfillment_status?.toLowerCase() || 'unfulfilled';
  if (status === 'fulfilled') return { text: 'Fulfilled', emoji: '✅' };
  if (status === 'partial') return { text: 'Partial', emoji: '📦' };
  return { text: 'Unfulfilled', emoji: '📋' };
}

function extractFirstProductImage(payload: any): string | null {
  const items = payload?.line_items;
  if (!Array.isArray(items) || items.length === 0) return null;
  
  for (const item of items) {
    // Shopify line items can have image in various places
    const imageUrl = item?.image?.src || item?.image_url || item?.product_image || item?.image;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      return imageUrl;
    }
  }
  return null;
}

function orderTypeEmoji(orderType: OrderType): string {
  if (orderType === 'ebay') return '🏷️';
  if (orderType === 'pickup') return '🏪';
  return '📦';
}

function orderTypeLabel(orderType: OrderType): string {
  if (orderType === 'ebay') return 'eBay Order';
  if (orderType === 'pickup') return 'Store Pickup';
  return 'Online Order';
}

function regionMeta(regionId: string) {
  return regionId === 'hawaii'
    ? { icon: '🌺', label: 'Hawaii', color: 0x2DD4BF }  // Teal for Hawaii
    : { icon: '🎰', label: 'Las Vegas', color: 0xF59E0B };  // Amber for Vegas
}

function buildOrderEmbed(regionId: string, payload: any, orderType: OrderType) {
  const { icon, label, color } = regionMeta(regionId);
  const orderName = extractOrderName(payload);
  const customerName = extractCustomerName(payload);
  const total = formatMoney(payload?.total_price || payload?.current_total_price || payload?.total);
  const items = extractLineItemsSummary(payload);
  const pickupLocation = extractPickupLocation(payload);
  const expectedDate = extractExpectedDate(payload);
  const payment = getPaymentStatus(payload);
  const fulfillment = getFulfillmentStatus(payload);
  const productImage = extractFirstProductImage(payload);
  const source = getOrderSource(payload);
  
  // Order date
  const createdAt = payload?.created_at 
    ? new Date(payload.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : null;

  // Build description with status badges
  let description = `## ${orderName}\n`;
  description += `${payment.emoji} **${payment.text}** • ${fulfillment.emoji} **${fulfillment.text}**\n`;
  if (createdAt) description += `🕐 ${createdAt}`;
  
  // Add pickup/shipping info
  if (orderType === 'pickup' && pickupLocation) {
    description += `\n\n🏪 **Pickup at ${pickupLocation}**`;
    if (expectedDate) description += `\n📅 Expected by ${expectedDate}`;
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: '👤 Customer', value: safeString(customerName), inline: true },
    { name: '💵 Total', value: safeString(total), inline: true },
    { name: `${orderTypeEmoji(orderType)} Type`, value: orderTypeLabel(orderType), inline: true },
    { name: '🔗 Source', value: `${source.emoji} ${source.label}`, inline: true },
  ];
  
  if (items) {
    fields.push({ name: '📦 Items', value: items, inline: false });
  }

  // Shopify admin link
  const shopDomain = payload?.shop_domain || 'alohacards-hi.myshopify.com';
  const numericId = String(payload?.id || '').match(/^\d+$/) ? String(payload.id) : null;
  const url = numericId ? `https://${shopDomain}/admin/orders/${numericId}` : undefined;

  const embed: any = {
    title: `${icon} ${label} • New ${orderTypeLabel(orderType)}`,
    description,
    color,
    url,
    fields,
    footer: { text: `Order ID: ${payload?.id || 'N/A'}` },
    timestamp: new Date().toISOString(),
  };
  
  // Add product thumbnail if available
  if (productImage) {
    embed.thumbnail = { url: productImage };
  }

  return embed;
}

// Default business hours for Discord notifications
const DEFAULT_BUSINESS_HOURS = { start: 8, end: 19 };

// Timezone mappings per region
const REGION_TIMEZONES: Record<string, string> = {
  hawaii: 'Pacific/Honolulu',
  vegas: 'America/Los_Angeles',
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
  } catch (e) {
    // Use defaults if fetch fails
  }
  
  // Get current hour in the region's timezone
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
  
  // Closed on Sundays
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

    const skippedRegions: string[] = [];

    // Process each region
    for (const [regionId, regionNotifications] of Object.entries(byRegion)) {
      console.log(`[flush-pending-notifications] Processing ${regionNotifications.length} notifications for ${regionId}`);
      
      // Check business hours for this region
      const { within, currentHour, timezone } = await isWithinBusinessHours(supabase, regionId);
      if (!within) {
        console.log(`[flush-pending-notifications] Outside business hours for ${regionId} (hour: ${currentHour}, tz: ${timezone}), skipping`);
        skippedRegions.push(regionId);
        results[regionId] = { sent: 0, failed: 0 };
        continue;
      }
      
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

/**
 * Determines the order source platform (eBay, Shopify, Draft Order, etc.)
 */
function getOrderSource(payload: any): { emoji: string; label: string } {
  const sourceName = payload?.source_name?.toLowerCase() || '';
  const tags = payload?.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const paymentGateways = payload?.payment_gateway_names || [];
  const hasEbayGateway = paymentGateways.some((g: string) => g?.toUpperCase() === 'EBAY');
  
  // eBay detection: source_name, tags, or payment gateway
  if (sourceName === 'ebay' || tagString.includes('ebay') || hasEbayGateway) {
    return { emoji: '🏷️', label: 'eBay' };
  }
  
  // Shopify website orders
  if (sourceName === 'web' || sourceName === 'online_store' || sourceName === 'shopify') {
    return { emoji: '🛒', label: 'Shopify Website' };
  }
  
  // Draft orders (manually created)
  if (sourceName === 'shopify_draft_order' || sourceName === 'draft_order') {
    return { emoji: '📝', label: 'Draft Order' };
  }
  
  // POS orders (shouldn't typically appear in notifications, but handle anyway)
  if (sourceName === 'pos' || sourceName === 'shopify_pos') {
    return { emoji: '🏪', label: 'In-Store POS' };
  }
  
  // Default fallback
  return { emoji: '🛍️', label: 'Online' };
}
