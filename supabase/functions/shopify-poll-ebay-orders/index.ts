import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveShopifyConfig } from '../_shared/resolveShopifyConfig.ts';
import { log } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiscordConfig {
  webhook_default?: string;
  webhook_channels?: Record<string, string>;
  mention_staff_role_id?: string;
  template_immediate?: string;
  template_queued?: string;
}

// Check if current time is within business hours in Hawaii (9am-7pm HST)
function isOpenNowInHawaii(): boolean {
  const now = new Date();
  const hstOffset = -10 * 60; // HST is UTC-10
  const hstTime = new Date(now.getTime() + (hstOffset + now.getTimezoneOffset()) * 60000);
  const hour = hstTime.getHours();
  const day = hstTime.getDay();
  
  // Closed on Sundays (day 0) or outside 9am-7pm
  if (day === 0 || hour < 9 || hour >= 19) {
    return false;
  }
  return true;
}

// Check if order has ebay tag
function hasEbayTag(tags: any): boolean {
  if (!tags) return false;
  if (typeof tags === 'string') {
    return tags.toLowerCase().includes('ebay');
  }
  if (Array.isArray(tags)) {
    return tags.some(t => t.toLowerCase().includes('ebay'));
  }
  return false;
}

// Render message template
function renderMessage(template: string, payload: any, config: DiscordConfig): string {
  let msg = template;
  msg = msg.replace(/{id}/g, payload.id || 'N/A');
  msg = msg.replace(/{name}/g, payload.name || 'N/A');
  msg = msg.replace(/{created_at}/g, payload.created_at || 'N/A');
  msg = msg.replace(/{total_price}/g, payload.total_price || 'N/A');
  msg = msg.replace(/{customer_name}/g, payload.customer_name || 'N/A');
  msg = msg.replace(/{mention}/g, config.mention_staff_role_id ? `<@&${config.mention_staff_role_id}>` : '');
  return msg;
}

// Generate barcode using jsbarcode (SVG format)
async function generateBarcode(orderId: string): Promise<string | null> {
  try {
    // Generate simple SVG barcode
    const barcodeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
      <rect width="100%" height="100%" fill="white"/>
      <text x="150" y="90" text-anchor="middle" font-family="monospace" font-size="12">${orderId}</text>
    </svg>`;
    
    return barcodeSvg;
  } catch (error: any) {
    log.warn('Failed to generate barcode', { error: error.message, orderId });
    return null;
  }
}

// Send Discord notification
async function sendDiscordNotification(
  webhookUrl: string,
  message: string,
  barcodeSvg: string | null
) {
  const payload: any = { content: message };
  
  if (barcodeSvg) {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(payload));
    formData.append('file', new Blob([barcodeSvg], { type: 'image/svg+xml' }), 'barcode.svg');
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}`);
    }
  } else {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  log.info('Polling Shopify for eBay orders', { requestId });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all configured Shopify stores
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('key, domain, api_version');

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`);
    }

    if (!stores || stores.length === 0) {
      log.info('No Shopify stores configured', { requestId });
      return new Response(
        JSON.stringify({ success: true, message: 'No stores to poll' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Discord config
    const { data: configData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'discord_notifications')
      .single();

    const discordConfig: DiscordConfig = configData?.value || {};

    const results = {
      stores_processed: 0,
      orders_found: 0,
      orders_notified: 0,
      orders_queued: 0,
      errors: [] as any[],
    };

    // Calculate date range (last 24 hours)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const store of stores) {
      try {
        log.info('Polling store', { requestId, storeKey: store.key });

        // Resolve Shopify credentials
        const configResult = await resolveShopifyConfig(supabase, store.key);
        if (!configResult.ok) {
          throw new Error(`Failed to resolve config: ${configResult.message}`);
        }

        const { domain, accessToken } = configResult.credentials;
        const apiVersion = store.api_version || '2024-07';

        // Query Shopify for orders with ebay tag
        const query = `
          query($cursor: String, $query: String!) {
            orders(first: 50, after: $cursor, query: $query) {
              edges {
                node {
                  id
                  name
                  createdAt
                  tags
                  totalPriceSet { shopMoney { amount currencyCode } }
                  customer { firstName }
                  billingAddress { firstName }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {
          const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query,
              variables: {
                cursor,
                query: `created_at:>${since} AND tag:ebay`,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Shopify API returned ${response.status}`);
          }

          const result = await response.json();
          
          if (result.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
          }

          const orders = result.data?.orders?.edges || [];
          results.orders_found += orders.length;

          for (const { node: order } of orders) {
            // Verify ebay tag
            if (!hasEbayTag(order.tags)) {
              continue;
            }

            const orderId = order.id.split('/').pop();
            const orderName = order.name;

            // Check if already notified
            const { data: existing } = await supabase
              .from('discord_notified_orders')
              .select('id')
              .eq('order_id', orderId)
              .eq('store_key', store.key)
              .single();

            if (existing) {
              log.info('Order already notified, skipping', { requestId, orderId, orderName });
              continue;
            }

            // Prepare notification data
            const customerName = order.customer?.firstName || 
                                order.billingAddress?.firstName || 
                                'Unknown';
            const totalPrice = order.totalPriceSet?.shopMoney?.amount || '0';
            const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'USD';

            const payload = {
              id: orderId,
              name: orderName,
              created_at: order.createdAt,
              total_price: `${totalPrice} ${currency}`,
              customer_name: customerName,
            };

            const isOpen = isOpenNowInHawaii();

            if (isOpen) {
              // Send immediately
              try {
                const webhookUrl = discordConfig.webhook_default;
                if (!webhookUrl) {
                  throw new Error('No Discord webhook configured');
                }

                const template = discordConfig.template_immediate || 
                  '🎯 **New eBay Order** {mention}\n**Order:** {name}\n**Customer:** {customer_name}\n**Total:** {total_price}\n**Time:** {created_at}';
                
                const message = renderMessage(template, payload, discordConfig);
                const barcodeSvg = await generateBarcode(orderId);
                
                await sendDiscordNotification(webhookUrl, message, barcodeSvg);
                
                results.orders_notified++;
                log.info('Sent Discord notification', { requestId, orderId, orderName });
              } catch (discordError: any) {
                log.error('Failed to send Discord notification, queueing', { 
                  requestId, 
                  orderId, 
                  error: discordError.message 
                });
                
                // Queue for later
                await supabase.from('pending_notifications').insert({
                  payload: payload,
                  sent: false,
                });
                results.orders_queued++;
              }
            } else {
              // Queue for business hours
              await supabase.from('pending_notifications').insert({
                payload: payload,
                sent: false,
              });
              results.orders_queued++;
              log.info('Queued order for business hours', { requestId, orderId, orderName });
            }

            // Record in tracking table
            await supabase.from('discord_notified_orders').insert({
              order_id: orderId,
              order_name: orderName,
              store_key: store.key,
            });
          }

          hasNextPage = result.data?.orders?.pageInfo?.hasNextPage || false;
          cursor = result.data?.orders?.pageInfo?.endCursor || null;
        }

        results.stores_processed++;
      } catch (storeError: any) {
        log.error('Error processing store', { 
          requestId, 
          storeKey: store.key, 
          error: storeError.message 
        });
        results.errors.push({
          store: store.key,
          error: storeError.message,
        });
      }
    }

    log.info('Polling complete', { requestId, results });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    log.error('Polling failed', { requestId, error: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
