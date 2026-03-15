import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_lib/cors.ts';
import JsBarcode from 'https://esm.sh/jsbarcode@3.11.6';

/**
 * Manual Discord notification sender for any online order.
 * Routes to region-specific Discord channels via region_settings.
 */

// ── Helpers ──

function safeString(v: unknown, fallback = 'N/A'): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const str = String(value).trim();
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
    'Customer'
  );
}

function extractOrderName(payload: any): string {
  const id = safeString(payload?.id || payload?.order_number || payload?.name, 'N/A');
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
    let line = `**${title}**`;
    if (variant) line += `\n   ${variant}`;
    if (sku) line += ` • ${sku}`;
    if (price && qty) line += `\n   ${price} × ${qty} = **${lineTotal}**`;
    lines.push(line);
  }
  const more = items.length > 8 ? `\n\n*… +${items.length - 8} more items*` : '';
  const out = lines.join('\n\n') + more;
  return out.length > 1024 ? out.slice(0, 1021) + '…' : out;
}

function extractFirstProductImage(payload: any): string | null {
  const items = payload?.line_items;
  if (!Array.isArray(items) || items.length === 0) return null;
  for (const item of items) {
    const imageUrl = item?.image?.src || item?.image_url || item?.product_image || item?.image;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      return imageUrl;
    }
  }
  return null;
}

function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  if (typeof tags === 'string') return tags.toLowerCase().split(',').map((t) => t.trim()).includes('ebay');
  if (Array.isArray(tags)) return tags.some((tag) => tag.toString().toLowerCase().trim() === 'ebay');
  return false;
}

function getOrderType(payload: any): string {
  if (hasEbayTag(payload.tags)) return 'ebay';
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  if (tagString.includes('pickup') || tagString.includes('local_pickup')) return 'pickup';
  return 'shipping';
}

function getOrderSource(payload: any): { emoji: string; label: string } {
  const sourceName = payload?.source_name?.toLowerCase() || '';
  const tags = payload?.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  if (sourceName === 'ebay' || tagString.includes('ebay')) return { emoji: '🏷️', label: 'eBay' };
  if (sourceName === 'web' || sourceName === 'online_store') return { emoji: '🛒', label: 'Shopify Website' };
  if (sourceName === 'shopify_draft_order') return { emoji: '📝', label: 'Draft Order' };
  return { emoji: '🛍️', label: 'Online' };
}

function getPaymentStatus(payload: any): { text: string; emoji: string } {
  const f = payload?.financial_status?.toLowerCase() || '';
  if (f === 'paid') return { text: 'Paid', emoji: '💰' };
  if (f === 'pending') return { text: 'Pending', emoji: '⏳' };
  return { text: 'Unpaid', emoji: '❌' };
}

function getFulfillmentStatus(payload: any): { text: string; emoji: string } {
  const s = payload?.fulfillment_status?.toLowerCase() || 'unfulfilled';
  if (s === 'fulfilled') return { text: 'Fulfilled', emoji: '✅' };
  if (s === 'partial') return { text: 'Partial', emoji: '📦' };
  return { text: 'Unfulfilled', emoji: '📋' };
}

function orderTypeEmoji(t: string): string {
  if (t === 'ebay') return '🏷️';
  if (t === 'pickup') return '🏪';
  return '📦';
}

function orderTypeLabel(t: string): string {
  if (t === 'ebay') return 'eBay Order';
  if (t === 'pickup') return 'Store Pickup';
  return 'Online Order';
}

function regionMeta(regionId: string) {
  return regionId === 'hawaii'
    ? { icon: '🌺', label: 'Hawaii', color: 0x2DD4BF }
    : { icon: '🎰', label: 'Las Vegas', color: 0xF59E0B };
}

function buildOrderEmbed(regionId: string, payload: any, orderType: string, shopDomain: string) {
  const { icon, label, color } = regionMeta(regionId);
  const orderName = extractOrderName(payload);
  const customerName = extractCustomerName(payload);
  const total = formatMoney(payload?.total_price || payload?.current_total_price);
  const items = extractLineItemsSummary(payload);
  const payment = getPaymentStatus(payload);
  const fulfillment = getFulfillmentStatus(payload);
  const productImage = extractFirstProductImage(payload);
  const source = getOrderSource(payload);

  const createdAt = payload?.created_at
    ? new Date(payload.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      })
    : null;

  let description = `## ${orderName}\n`;
  description += `${payment.emoji} **${payment.text}** • ${fulfillment.emoji} **${fulfillment.text}**\n`;
  if (createdAt) description += `🕐 ${createdAt}`;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: '👤 Customer', value: safeString(customerName), inline: true },
    { name: '💵 Total', value: safeString(total), inline: true },
    { name: `${orderTypeEmoji(orderType)} Type`, value: orderTypeLabel(orderType), inline: true },
    { name: '🔗 Source', value: `${source.emoji} ${source.label}`, inline: true },
  ];
  if (items) fields.push({ name: '📦 Items', value: items, inline: false });

  const numericId = String(payload?.id || '').match(/^\d+$/) ? String(payload.id) : null;
  const url = numericId ? `https://${shopDomain}/admin/orders/${numericId}` : undefined;

  const embed: any = {
    title: `${icon} ${label} • ${orderTypeLabel(orderType)} (Manual)`,
    description,
    color,
    url,
    fields,
    footer: { text: `Order ID: ${payload?.id || 'N/A'}` },
    timestamp: new Date().toISOString(),
  };
  if (productImage) embed.thumbnail = { url: productImage };
  return embed;
}

// ── Map storeKey → regionId ──

function storeKeyToRegionId(storeKey: string): string {
  const key = storeKey.toLowerCase().replace(/[_-]/g, '');
  if (key.includes('vegas') || key.includes('lasvegas') || key.includes('lv')) return 'las_vegas';
  return 'hawaii';
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { orderNumber, storeKey } = await req.json();

    if (!orderNumber || !storeKey) {
      throw new Error('orderNumber and storeKey are required');
    }

    // Map storeKey → region
    const regionId = storeKeyToRegionId(storeKey);

    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase();
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
      .single();

    const domain = domainSetting?.key_value;
    const token = tokenSetting?.key_value;

    if (!domain || !token) {
      throw new Error(`Shopify credentials not found for store: ${storeKey}`);
    }

    // Fetch order from Shopify
    const shopifyResponse = await fetch(
      `https://${domain}/admin/api/2024-07/orders.json?name=${encodeURIComponent(orderNumber)}`,
      {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!shopifyResponse.ok) {
      throw new Error(`Shopify API error: ${shopifyResponse.status}`);
    }

    const { orders } = await shopifyResponse.json();

    if (!orders || orders.length === 0) {
      throw new Error(`Order not found: ${orderNumber}`);
    }

    const order = orders[0];
    const orderType = getOrderType(order);

    // Load region-specific Discord config
    const { data: discordSettings } = await supabase
      .from('region_settings')
      .select('setting_key, setting_value')
      .eq('region_id', regionId)
      .like('setting_key', 'discord.%');

    const webhookUrl = discordSettings?.find((s: any) => s.setting_key === 'discord.webhook_url')?.setting_value;
    const enabled = discordSettings?.find((s: any) => s.setting_key === 'discord.enabled')?.setting_value !== false;
    const roleId = discordSettings?.find((s: any) => s.setting_key === 'discord.role_id')?.setting_value || '';

    if (!enabled || !webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, message: `Discord not configured for region: ${regionId}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build rich embed
    const embed = buildOrderEmbed(regionId, order, orderType, domain);
    const mention = roleId ? `<@&${roleId}>\n` : '';

    // Generate barcode SVG
    let barcodeSvg: string | null = null;
    try {
      const orderId = order.id?.toString() || order.order_number?.toString() || 'NO-ID';
      const svg = JsBarcode(orderId, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        xmlDocument: true,
      });
      barcodeSvg = svg;
    } catch (error) {
      console.warn('Failed to generate barcode:', error);
    }

    // Send to Discord
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({
      content: `${mention}📬 **MANUAL NOTIFICATION**`,
      embeds: [embed],
      allowed_mentions: { parse: ['roles'] },
    }));

    if (barcodeSvg) {
      const svgBlob = new Blob([barcodeSvg], { type: 'image/svg+xml' });
      formData.append('files[0]', svgBlob, 'barcode.svg');
    }

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} ${errorText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notification sent to ${regionId} Discord channel`,
        orderNumber: order.name,
        region: regionId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Manual notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
