
# Discord Notifications for Online Shopify Orders (Region-Specific)

## ✅ IMPLEMENTATION COMPLETE

### Changes Made

1. **Database Migration**
   - Added `region_id` column to `pending_notifications` table (defaults to 'hawaii')
   - Added index for efficient querying by region and sent status

2. **`shopify-webhook` Edge Function**
   - Replaced `hasEbayTag()` filter with `isOnlineOrderNeedingFulfillment()` 
   - Excludes POS orders (`source_name` = 'pos' or 'shopify_pos')
   - Includes orders with shipping lines, shipping address, pickup tags, or items requiring shipping
   - Added `getOrderType()` to categorize orders as 'shipping', 'pickup', or 'ebay'
   - Added `getOrderRegionFromPayload()` for improved region detection using shop domain
   - Discord messages now include order type badge: 🛍️ ONLINE ORDER, 📦 PICKUP ORDER, 🏷️ eBay ORDER

3. **`flush-pending-notifications` Edge Function** (NEW)
   - Groups pending notifications by `region_id`
   - Fetches region-specific Discord config from `region_settings` table
   - Sends batched notifications with 1-second delay to avoid rate limits
   - Marks notifications as sent after successful delivery

4. **`PendingNotifications` Page**
   - Updated to display region badge (🌺 Hawaii / 🎰 Las Vegas)
   - Fixed type definitions for new payload structure

---

## Configuration Required

Before notifications will route correctly, you MUST configure Discord settings in the `region_settings` table:

### SQL to Insert Discord Settings

```sql
-- Hawaii Discord Config
INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES 
  ('hawaii', 'discord.webhook_url', '"YOUR_HAWAII_WEBHOOK_URL"', 'Discord webhook for Hawaii orders'),
  ('hawaii', 'discord.role_id', '"YOUR_HAWAII_ROLE_ID"', 'Role ID to mention for Hawaii'),
  ('hawaii', 'discord.enabled', 'true', 'Enable Discord for Hawaii')
ON CONFLICT (region_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- Las Vegas Discord Config
INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES 
  ('las_vegas', 'discord.webhook_url', '"YOUR_VEGAS_WEBHOOK_URL"', 'Discord webhook for Las Vegas orders'),
  ('las_vegas', 'discord.role_id', '"YOUR_VEGAS_ROLE_ID"', 'Role ID to mention for Las Vegas'),
  ('las_vegas', 'discord.enabled', 'true', 'Enable Discord for Las Vegas')
ON CONFLICT (region_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
```

### Cron Job (Already Scheduled)

The flush job runs daily at 9:00 AM HST (19:00 UTC). To reschedule:

```sql
-- View current schedule
SELECT * FROM cron.job WHERE jobname LIKE '%discord%';

-- Reschedule if needed
SELECT cron.unschedule('flush-discord-notifications');
SELECT cron.schedule(
  'flush-discord-notifications',
  '0 19 * * *', -- 09:00 HST
  $$SELECT net.http_post(...)$$
);
```

---

## Order Eligibility Logic

**Notifications are sent for orders where:**
- `source_name` is NOT 'pos' or 'shopify_pos'
- `fulfillment_status` is NOT 'fulfilled'
- Order has shipping lines, shipping address, pickup tags, or items requiring shipping

**Notifications are NOT sent for:**
- POS walk-in sales
- Already fulfilled orders
- Draft orders (unless processed)

---

## Region Detection Priority

1. **Shop domain** from webhook header (most reliable)
   - `aloha-card-shop.myshopify.com` → Hawaii
   - `vqvxdi-ar.myshopify.com` → Las Vegas

2. **Fulfillment location name** in order
   - Contains "hawaii" or "honolulu" → Hawaii
   - Contains "vegas" or "702" → Las Vegas

3. **Order tags**
   - Contains "hawaii" → Hawaii
   - Contains "las_vegas" or "vegas" → Las Vegas

4. **Default**: Hawaii

---

## Message Format

Immediate notifications include:
- Region icon (🌺 or 🎰) and label
- Order type badge (🛍️ ONLINE ORDER / 📦 PICKUP ORDER / 🏷️ eBay ORDER)
- Order details from template
- Staff role mention (if configured and within business hours)

Example:
```
🌺 **Hawaii** | 🛍️ **ONLINE ORDER**
📋 **Order:** #1234
👤 **Customer:** John
💰 **Total:** $99.99

@Staff New order needs attention!
```

