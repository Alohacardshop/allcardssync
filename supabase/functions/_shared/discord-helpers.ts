/**
 * Shared Discord notification helpers.
 * Single source of truth for embed building, formatting, and order classification.
 */

// ── Types ──

export type OrderType = 'shipping' | 'pickup' | 'ebay';

export interface RegionalDiscordConfig {
  webhookUrl: string | null;
  channelName: string | null;
  roleId: string | null;
  enabled: boolean;
}

// ── String helpers ──

export function safeString(v: unknown, fallback = 'N/A'): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

export function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  const str = String(value).trim();
  if (/[a-zA-Z]/.test(str)) return str;
  const num = Number(str);
  if (!Number.isFinite(num)) return str;
  return `$${num.toFixed(2)}`;
}

// ── Order data extraction ──

export function extractCustomerName(payload: any): string {
  // Combine first + last name when available
  const customer = payload?.customer;
  if (customer?.first_name) {
    const parts = [customer.first_name, customer.last_name].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  // Fallback chain
  if (payload?.customer_name) return payload.customer_name;

  const billing = payload?.billing_address;
  if (billing?.first_name) {
    const parts = [billing.first_name, billing.last_name].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  return customer?.name || billing?.name || 'Customer';
}

export function extractOrderId(payload: any): string {
  return safeString(payload?.id || payload?.order_number || payload?.name, 'N/A');
}

export function extractOrderName(payload: any): string {
  const id = extractOrderId(payload);
  return safeString(payload?.name, id.startsWith('#') ? id : `#${id}`);
}

export function extractLineItemsSummary(payload: any): string | null {
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

export function extractFirstProductImage(payload: any): string | null {
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

export function extractPickupLocation(payload: any): string | null {
  const fulfillments = payload?.fulfillments || [];
  for (const f of fulfillments) {
    if (f?.location?.name) return f.location.name;
    if (f?.origin_address?.company) return f.origin_address.company;
  }
  const shippingLines = payload?.shipping_lines || [];
  for (const s of shippingLines) {
    if (s?.title?.toLowerCase().includes('pickup')) {
      const match = s.title.match(/pickup\s*[-–—]\s*(.+)/i);
      if (match) return match[1].trim();
    }
  }
  const tags = payload?.tags || '';
  const tagStr = typeof tags === 'string' ? tags : tags.join(',');
  if (tagStr.toLowerCase().includes('ward')) return 'Ward Ave';
  if (tagStr.toLowerCase().includes('vegas') || tagStr.toLowerCase().includes('lv')) return 'Las Vegas';
  return null;
}

export function extractExpectedDate(payload: any): string | null {
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

/**
 * Extract shipping destination city + state for shipping orders.
 */
export function extractShippingDestination(payload: any): string | null {
  const addr = payload?.shipping_address;
  if (!addr) return null;
  const parts = [addr.city, addr.province_code || addr.province].filter(Boolean);
  if (parts.length === 0) return null;
  const dest = parts.join(', ');
  if (addr.country_code && addr.country_code !== 'US') {
    return `${dest}, ${addr.country_code}`;
  }
  return dest;
}

// ── Order classification ──

export function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  if (typeof tags === 'string') return tags.toLowerCase().split(',').map((t: string) => t.trim()).includes('ebay');
  if (Array.isArray(tags)) return tags.some((tag: any) => tag.toString().toLowerCase().trim() === 'ebay');
  return false;
}

export function getOrderType(payload: any): OrderType {
  if (hasEbayTag(payload.tags)) return 'ebay';
  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const hasPickupTag = tagString.includes('pickup') || tagString.includes('local_pickup') || tagString.includes('store_pickup');
  const fulfillments = payload.fulfillments || [];
  const hasPickupFulfillment = fulfillments.some((f: any) =>
    f.service === 'local_pickup' ||
    f.delivery_type === 'pickup' ||
    (f.name || '').toLowerCase().includes('pickup')
  );
  if (hasPickupTag || hasPickupFulfillment) return 'pickup';
  return 'shipping';
}

export function getOrderSource(payload: any): { emoji: string; label: string } {
  const sourceName = payload?.source_name?.toLowerCase() || '';
  const tags = payload?.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const paymentGateways = payload?.payment_gateway_names || [];
  const hasEbayGateway = paymentGateways.some((g: string) => g?.toUpperCase() === 'EBAY');
  if (sourceName === 'ebay' || tagString.includes('ebay') || hasEbayGateway) return { emoji: '🏷️', label: 'eBay' };
  if (sourceName === 'web' || sourceName === 'online_store' || sourceName === 'shopify') return { emoji: '🛒', label: 'Shopify Website' };
  if (sourceName === 'shopify_draft_order' || sourceName === 'draft_order') return { emoji: '📝', label: 'Draft Order' };
  if (sourceName === 'pos' || sourceName === 'shopify_pos') return { emoji: '🏪', label: 'In-Store POS' };
  return { emoji: '🛍️', label: 'Online' };
}

// ── Status helpers ──

export function getPaymentStatus(payload: any): { text: string; emoji: string } {
  const financial = payload?.financial_status?.toLowerCase() || '';
  if (financial === 'paid') return { text: 'Paid', emoji: '💰' };
  if (financial === 'pending') return { text: 'Pending', emoji: '⏳' };
  if (financial === 'refunded') return { text: 'Refunded', emoji: '↩️' };
  if (financial === 'partially_refunded') return { text: 'Partial Refund', emoji: '↩️' };
  return { text: 'Unpaid', emoji: '❌' };
}

export function getFulfillmentStatus(payload: any): { text: string; emoji: string } {
  const status = payload?.fulfillment_status?.toLowerCase() || 'unfulfilled';
  if (status === 'fulfilled') return { text: 'Fulfilled', emoji: '✅' };
  if (status === 'partial') return { text: 'Partial', emoji: '📦' };
  return { text: 'Unfulfilled', emoji: '📋' };
}

// ── Visual helpers ──

export function orderTypeEmoji(orderType: string): string {
  if (orderType === 'ebay') return '🏷️';
  if (orderType === 'pickup') return '🏪';
  return '📦';
}

export function orderTypeLabel(orderType: string): string {
  if (orderType === 'ebay') return 'eBay Order';
  if (orderType === 'pickup') return 'Store Pickup';
  return 'Online Order';
}

export function regionMeta(regionId: string) {
  return regionId === 'hawaii'
    ? { icon: '🌺', label: 'Hawaii', color: 0x2DD4BF }
    : { icon: '🎰', label: 'Las Vegas', color: 0xF59E0B };
}

// ── Embed builders ──

export function buildOrderEmbed(
  regionId: string,
  payload: any,
  orderType: OrderType | string,
  shopDomainOverride?: string | null,
  titleSuffix?: string
) {
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
  const shippingDest = extractShippingDestination(payload);

  const createdAt = payload?.created_at
    ? new Date(payload.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      })
    : null;

  let description = `## ${orderName}\n`;
  description += `${payment.emoji} **${payment.text}** • ${fulfillment.emoji} **${fulfillment.text}**\n`;
  if (createdAt) description += `🕐 ${createdAt}`;

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

  // Add shipping destination for shipping orders
  if (orderType === 'shipping' && shippingDest) {
    fields.push({ name: '📍 Ship To', value: shippingDest, inline: true });
  }

  if (items) {
    fields.push({ name: '📦 Items', value: items, inline: false });
  }

  // Shopify admin link
  const shopDomain = shopDomainOverride || payload?.shop_domain || 'alohacards-hi.myshopify.com';
  const numericId = String(payload?.id || '').match(/^\d+$/) ? String(payload.id) : null;
  const url = numericId ? `https://${shopDomain}/admin/orders/${numericId}` : undefined;

  const suffix = titleSuffix ? ` ${titleSuffix}` : '';
  const embed: any = {
    title: `${icon} ${label} • New ${orderTypeLabel(orderType)}${suffix}`,
    description,
    color,
    url,
    fields,
    footer: { text: `Order ID: ${payload?.id || 'N/A'}` },
    timestamp: new Date().toISOString(),
  };

  if (productImage) {
    embed.thumbnail = { url: productImage };
  }

  return embed;
}

/**
 * Build a cancellation / refund embed (red color, different title).
 */
export function buildCancellationEmbed(
  regionId: string,
  payload: any,
  type: 'cancelled' | 'refunded',
  shopDomainOverride?: string | null
) {
  const { icon, label } = regionMeta(regionId);
  const orderName = extractOrderName(payload);
  const customerName = extractCustomerName(payload);
  const total = formatMoney(payload?.total_price || payload?.current_total_price || payload?.total);
  const items = extractLineItemsSummary(payload);
  const productImage = extractFirstProductImage(payload);

  const emoji = type === 'cancelled' ? '🚫' : '↩️';
  const verb = type === 'cancelled' ? 'CANCELLED' : 'REFUNDED';

  let description = `## ${orderName}\n`;
  description += `${emoji} **Order ${verb}**\n`;
  if (payload?.cancel_reason) {
    description += `📝 Reason: ${payload.cancel_reason}\n`;
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: '👤 Customer', value: safeString(customerName), inline: true },
    { name: '💵 Total', value: safeString(total), inline: true },
  ];

  if (items) {
    fields.push({ name: '📦 Items', value: items, inline: false });
  }

  const shopDomain = shopDomainOverride || payload?.shop_domain || 'alohacards-hi.myshopify.com';
  const numericId = String(payload?.id || '').match(/^\d+$/) ? String(payload.id) : null;
  const url = numericId ? `https://${shopDomain}/admin/orders/${numericId}` : undefined;

  const embed: any = {
    title: `${icon} ${label} • ${emoji} Order ${verb}`,
    description,
    color: 0xEF4444, // Red
    url,
    fields,
    footer: { text: `Order ID: ${payload?.id || 'N/A'}` },
    timestamp: new Date().toISOString(),
  };

  if (productImage) {
    embed.thumbnail = { url: productImage };
  }

  return embed;
}

// ── Discord config from DB ──

export async function getRegionDiscordConfig(supabase: any, regionId: string): Promise<RegionalDiscordConfig | null> {
  try {
    const { data: settings } = await supabase
      .from('region_settings')
      .select('setting_key, setting_value')
      .eq('region_id', regionId)
      .like('setting_key', 'discord.%');

    if (!settings || settings.length === 0) return null;

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

// ── Region mapping ──

export function storeKeyToRegionId(storeKey: string): string {
  const key = storeKey.toLowerCase().replace(/[_-]/g, '');
  if (key.includes('vegas') || key.includes('lasvegas') || key.includes('lv')) return 'las_vegas';
  return 'hawaii';
}

/**
 * Determine region from order payload using shop domain, fulfillment location, or tags.
 */
export function getOrderRegionFromPayload(payload: any, shopDomain: string | null): string {
  if (shopDomain) {
    const domain = shopDomain.toLowerCase();
    if (domain.includes('aloha-card-shop') || domain.includes('hawaii')) return 'hawaii';
    if (domain.includes('vqvxdi-ar') || domain.includes('vegas')) return 'las_vegas';
  }

  const fulfillmentLocation = payload.fulfillment_location_name || payload.location_name || '';
  const locationLower = fulfillmentLocation.toLowerCase();
  if (locationLower.includes('vegas') || locationLower.includes('las vegas')) return 'las_vegas';
  if (locationLower.includes('hawaii') || locationLower.includes('honolulu')) return 'hawaii';

  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  if (tagString.includes('las_vegas') || tagString.includes('vegas')) return 'las_vegas';
  if (tagString.includes('hawaii')) return 'hawaii';

  const lineItems = payload.line_items || [];
  for (const item of lineItems) {
    const assignedLocation = item.origin_location?.name || item.location_name || '';
    if (assignedLocation.toLowerCase().includes('vegas')) return 'las_vegas';
    if (assignedLocation.toLowerCase().includes('hawaii')) return 'hawaii';
  }

  return 'hawaii';
}

/**
 * Check if an order is online (not POS) and needs fulfillment.
 */
export function isOnlineOrderNeedingFulfillment(payload: any): boolean {
  const sourceName = payload.source_name || '';
  if (sourceName === 'pos' || sourceName === 'shopify_pos' || sourceName === 'POS') return false;
  if (payload.fulfillment_status === 'fulfilled') return false;

  const shippingLines = payload.shipping_lines || [];
  const hasShipping = shippingLines.length > 0;
  const hasShippingAddress = payload.shipping_address != null;

  const tags = payload.tags || '';
  const tagString = typeof tags === 'string' ? tags.toLowerCase() : (tags as any[]).join(',').toLowerCase();
  const hasPickupTag = tagString.includes('pickup') || tagString.includes('local_pickup') || tagString.includes('store_pickup');

  const fulfillments = payload.fulfillments || [];
  const hasPickupFulfillment = fulfillments.some((f: any) =>
    f.service === 'local_pickup' ||
    f.delivery_type === 'pickup' ||
    (f.name || '').toLowerCase().includes('pickup')
  );

  const lineItems = payload.line_items || [];
  const hasItemsRequiringShipping = lineItems.some((item: any) => item.requires_shipping !== false);

  return hasShipping || hasShippingAddress || hasPickupTag || hasPickupFulfillment || hasItemsRequiringShipping;
}

/**
 * Send a Discord cancellation/refund notification for an order.
 */
export async function sendCancellationNotification(
  supabase: any,
  payload: any,
  type: 'cancelled' | 'refunded',
  shopifyDomain: string | null
) {
  try {
    const regionId = getOrderRegionFromPayload(payload, shopifyDomain);
    const config = await getRegionDiscordConfig(supabase, regionId);

    if (!config?.enabled || !config.webhookUrl) {
      console.log(`Discord not configured/enabled for ${regionId}, skipping ${type} notification`);
      return;
    }

    const embed = buildCancellationEmbed(regionId, payload, type, shopifyDomain);
    const mention = config.roleId ? `<@&${config.roleId}>\n` : '';
    const emoji = type === 'cancelled' ? '🚫' : '↩️';

    const discordResponse = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${mention}${emoji} **Order ${type.toUpperCase()}**`,
        embeds: [embed],
        allowed_mentions: { parse: ['roles'] },
      }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error(`Discord ${type} notification error:`, discordResponse.status, errorText);
    } else {
      console.log(`Sent ${type} notification to ${regionId} Discord channel`);
    }
  } catch (error) {
    console.error(`Discord ${type} notification error:`, error);
  }
}
