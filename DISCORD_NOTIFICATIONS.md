# Discord Notifications for eBay Orders

## Overview

This system sends Discord notifications for Shopify orders tagged with "ebay", with business-hours logic that queues messages when closed (before 9am or after 7pm Hawaii time).

## Components

### 1. Database Tables

#### `app_settings`
Stores Discord configuration:
- `discord.webhooks` - Channel webhook URLs and defaults
- `discord.mention` - Staff role mention settings
- `discord.templates` - Message templates for immediate and queued notifications

#### `pending_notifications`
Queue for off-hours notifications:
- `id` - Unique identifier
- `created_at` - When the notification was queued
- `payload` - Order JSON data
- `sent` - Boolean flag indicating if sent

### 2. Admin UI

**Route:** `/admin/notifications/discord`

**Features:**
- Configure multiple Discord webhook channels
- Set default channels for immediate vs queued notifications
- Configure staff role mentions
- Edit message templates with variable support
- Test notifications before going live
- Reset templates to defaults

**Access:** Admin-only (protected by `AdminGuard`)

### 3. Edge Functions

#### `discord-test`
- **Purpose:** Test Discord webhook configuration
- **Auth:** Requires JWT (admin/staff)
- **Endpoint:** `POST /functions/v1/discord-test`
- **Body:**
  ```json
  {
    "channelName": "Operations",
    "payload": {
      "id": "TEST-123",
      "customer_name": "Test Customer",
      "total": "$99.99"
    }
  }
  ```

#### `shopify-webhook-discord`
- **Purpose:** Process Shopify order webhooks for eBay orders
- **Auth:** Public (no JWT required - for Shopify webhooks)
- **Endpoint:** `POST /functions/v1/shopify-webhook-discord`
- **Logic:**
  1. Check if order has "ebay" tag (case-insensitive)
  2. If not eBay, ignore
  3. Check if Hawaii business hours (9am-7pm HST)
  4. If open → send immediately to "immediate" channel
  5. If closed → queue to `pending_notifications`
  6. Dedupe check to prevent duplicate queued orders

#### `flush-pending-notifications`
- **Purpose:** Send queued notifications at business open (9am HST)
- **Auth:** Public (called by cron)
- **Endpoint:** `POST /functions/v1/flush-pending-notifications`
- **Cron:** Daily at 09:00 HST (19:00 UTC)
- **Logic:**
  1. Fetch all unsent notifications
  2. Send each to "queued" channel
  3. Mark as sent
  4. Return count of flushed notifications

## Message Templates

### Variables Supported
- `{id}` - Order ID
- `{customer_name}` - Customer first name
- `{total}` - Order total price
- `{created_at}` - Order creation timestamp
- `{tags}` - Order tags array
- `{raw_json}` - Full order JSON (truncated to 1800 chars)
- `{role_id}` - Discord role ID for mentions

### Default Templates

**Immediate:**
```
<@&{role_id}> New **eBay** order received!
• Order ID: {id}
• Customer: {customer_name}
• Total: {total}
```

**Queued:**
```
<@&{role_id}> Queued **eBay** order from off-hours:
• Order ID: {id}
• Customer: {customer_name}
• Total: {total}
```

## Shopify Integration

### Webhook Setup

1. In Shopify Admin, go to **Settings → Notifications → Webhooks**
2. Create webhook for `orders/create` or `orders/paid`
3. Set URL to: `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-webhook-discord`
4. Format: JSON
5. **IMPORTANT:** Tag orders with "ebay" for them to trigger notifications

### Order Tagging

Orders must be tagged with "ebay" (case-insensitive) to trigger Discord notifications.

Tags can be:
- String: `"ebay, priority, express"`
- Array: `["ebay", "priority", "express"]`

## Cron Job Setup

### Supabase Cron (Recommended)

Add to your SQL migrations:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule flush at 9am HST daily (19:00 UTC)
SELECT cron.schedule(
  'flush-discord-notifications',
  '0 19 * * *', -- 09:00 HST = 19:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### Manual Trigger

For testing, you can manually trigger the flush:

```bash
curl -X POST https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications
```

## Configuration Steps

### 1. Get Discord Webhook URL

1. In Discord, go to Server Settings → Integrations → Webhooks
2. Create a new webhook or select existing
3. Copy the Webhook URL
4. Paste into admin UI

### 2. Get Staff Role ID

1. Enable Developer Mode in Discord: User Settings → Advanced → Developer Mode
2. Right-click your staff role → Copy ID
3. Paste into admin UI

### 3. Configure Templates

1. Edit templates in admin UI
2. Use variables like `{id}`, `{customer_name}`, etc.
3. Test with "Send Test" button
4. Save configuration

### 4. Test End-to-End

1. Create a test Shopify order
2. Tag it with "ebay"
3. Check Discord channel for notification
4. If off-hours, check `pending_notifications` table
5. Wait for cron or manually trigger flush

## Troubleshooting

### No notifications received

- ✅ Check order has "ebay" tag
- ✅ Verify webhook URL is correct in admin UI
- ✅ Check Discord channel permissions
- ✅ Check edge function logs: [Function logs](https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/functions/shopify-webhook-discord/logs)

### Test send fails

- ✅ Verify webhook URL starts with `https://discord.com/api/webhooks/`
- ✅ Check Discord webhook hasn't been deleted
- ✅ Try regenerating webhook in Discord

### Cron not running

- ✅ Verify pg_cron is enabled
- ✅ Check cron schedule: `SELECT * FROM cron.job;`
- ✅ Check cron logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Messages queued but not sent

- ✅ Check `pending_notifications` table
- ✅ Manually trigger flush function
- ✅ Verify cron schedule is correct (19:00 UTC = 09:00 HST)

## Security

- Admin UI protected by `AdminGuard` (admin role required)
- `app_settings` table has RLS policies restricting to admins only
- `pending_notifications` readable by admins, writable by system
- Webhook URLs stored in database (not in code)
- Edge functions validate configuration before sending

## Database Queries

### Check pending notifications
```sql
SELECT * FROM pending_notifications WHERE sent = false;
```

### Check configuration
```sql
SELECT * FROM app_settings WHERE key LIKE 'discord.%';
```

### Mark notification as unsent (for retry)
```sql
UPDATE pending_notifications SET sent = false WHERE id = 'xxx';
```

### Clear old sent notifications
```sql
DELETE FROM pending_notifications WHERE sent = true AND created_at < NOW() - INTERVAL '30 days';
```

## Future Enhancements

- [ ] Support multiple order webhooks (create, paid, fulfilled)
- [ ] Rich embeds with order details
- [ ] Image attachments from order line items
- [ ] Notification filters by order value
- [ ] Multiple staff roles for different channels
- [ ] Retry logic for failed Discord sends
- [ ] Analytics dashboard for notification delivery

## Support

For issues or questions:
1. Check edge function logs
2. Review pending notifications table
3. Test configuration with test send button
4. Check Discord webhook status in Discord settings
