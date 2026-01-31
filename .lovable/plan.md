
# Discord Notifications for Online Shopify Orders (Region-Specific)

## Overview
Extend the current Discord notification system to send notifications for **all online Shopify orders** (not just eBay) that require shipping or in-store pickup, with proper routing to Hawaii or Las Vegas Discord channels based on the fulfillment location.

## Current State Analysis
- Discord notifications currently **only fire for eBay-tagged orders** due to a `hasEbayTag()` filter
- Region detection already exists via `getOrderRegion()` function
- Region-specific Discord settings exist in `region_settings` table but webhook URLs are empty
- The `pending_notifications` table lacks a `region_id` column for proper queuing

## What Changes

### 1. Order Eligibility Logic
Replace the eBay-only filter with a broader filter for "online orders needing fulfillment":

**Eligible orders:**
- `source_name` is NOT `"pos"` (excludes POS walk-in sales)
- Order has items requiring shipping OR is marked for pickup
- `fulfillment_status` is `null` or `"unfulfilled"` (not yet shipped)

**Detection approach:**
```text
function isOnlineOrderNeedingFulfillment(payload):
  # Skip POS sales (already handled in-store)
  if source_name == "pos" or source_name == "shopify_pos":
    return false
  
  # Check if order needs shipping or pickup
  hasShippingLines = shipping_lines?.length > 0
  hasPickupLine = fulfillments has pickup method OR tags include "pickup"
  
  return hasShippingLines OR hasPickupLine
```

### 2. Region-Specific Discord Routing
Orders will be routed to the correct Discord channel based on:

1. **Primary:** Fulfillment location in the order
2. **Fallback:** Store domain from webhook header
3. **Default:** Hawaii (if undetermined)

Each region (Hawaii, Las Vegas) will have its own:
- Discord webhook URL
- Staff role ID for mentions
- Business hours for immediate vs queued notifications

### 3. Database Changes

**Add `region_id` column to `pending_notifications`:**
```sql
ALTER TABLE pending_notifications 
ADD COLUMN region_id text DEFAULT 'hawaii';
```

This enables the flush job to send queued notifications to the correct regional channel.

### 4. Configuration Requirements
Before this feature works, you must configure regional Discord settings:

| Setting Key | Hawaii | Las Vegas |
|-------------|--------|-----------|
| `discord.webhook_url` | (your HI webhook) | (your LV webhook) |
| `discord.role_id` | (HI staff role) | (LV staff role) |
| `discord.enabled` | true | true |

These are stored in the `region_settings` table per region.

## Technical Implementation

### Files to Modify

1. **`supabase/functions/shopify-webhook/index.ts`**
   - Add `isOnlineOrderNeedingFulfillment()` helper function
   - Modify `sendDiscordNotification()` to use new eligibility logic
   - Improve region detection using `shop_domain` from webhook headers
   - Include `region_id` when inserting to `pending_notifications`

2. **`supabase/functions/flush-pending-notifications/index.ts`** (create if missing)
   - Group pending notifications by `region_id`
   - Send each batch to the corresponding regional webhook

3. **Database Migration**
   - Add `region_id` column to `pending_notifications`
   - Backfill existing rows with detected region or default to `'hawaii'`

### Order Type Detection Logic

```text
Order Payload Fields Used:
- source_name: "web", "pos", "shopify_draft_order", etc.
- fulfillment_status: null, "unfulfilled", "partial", "fulfilled"
- shipping_lines: array of shipping methods
- shipping_address: present for shipped orders
- line_items[].requires_shipping: true/false per item
```

### Region Detection Hierarchy

```text
1. Check shop_domain from webhook header
   - "aloha-card-shop.myshopify.com" → hawaii
   - "vqvxdi-ar.myshopify.com" → las_vegas

2. Check fulfillment location name in order
   - Contains "hawaii" → hawaii
   - Contains "vegas" → las_vegas

3. Check order tags
   - Contains "las_vegas" or "vegas" → las_vegas
   - Contains "hawaii" → hawaii

4. Default: hawaii
```

## Message Template Updates
Consider updating templates to indicate order type:

```text
🛍️ **NEW ONLINE ORDER** (needs shipping)
📦 **NEW PICKUP ORDER** (in-store pickup)
🏷️ **NEW EBAY ORDER** (marketplace sale)
```

## Summary of Changes

| Component | Change |
|-----------|--------|
| Order filter | eBay-only → All online orders needing fulfillment |
| POS orders | Excluded (no notification) |
| Region routing | Orders sent to regional Discord channels |
| pending_notifications | Add region_id column |
| Flush job | Route queued messages to correct regional webhook |

## Action Items After Implementation

1. **Configure Discord webhooks** in `region_settings` table for both Hawaii and Las Vegas
2. **Configure staff role IDs** for @mentions in each region
3. **Test with a sample online order** to verify routing
4. **Verify business hours** are correct for each region

## Optional Enhancements

- Add order type badge (shipping/pickup/ebay) to Discord messages
- Include shipping method in notification (Standard, Express, etc.)
- Add pickup location details for in-store pickup orders
