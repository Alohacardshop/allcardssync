

# Improve Discord Order Notifications

## Current State

There are three notification paths, and they're inconsistent:

| Path | Embeds? | Product Link? | Thumbnail? | Region Routing? |
|------|---------|---------------|------------|-----------------|
| **`shopify-webhook`** (immediate) | No -- plain text + barcode SVG | No | No | Yes (correct) |
| **`flush-pending-notifications`** (queued) | Yes -- rich embeds | Yes -- Shopify admin link | Yes -- first product image | Yes (correct) |
| **`shopify-order-notify`** (manual) | Yes -- basic embeds | No | Uses `item.image_url` (rarely populated) | No -- uses global config |

## What Needs to Change

### 1. Upgrade `shopify-webhook` immediate notifications to use rich embeds

The `flush-pending-notifications` function already has excellent embed-building logic (`buildOrderEmbed`) with:
- Product thumbnails from line item images
- Shopify admin order link (clickable title)
- Customer name, total, payment/fulfillment status badges
- Item list with SKU, quantity, price
- Region color coding (teal for Hawaii, amber for Vegas)

The **immediate** path in `sendDiscordNotification` currently sends plain text. We'll replace it with the same `buildOrderEmbed` pattern so both immediate and queued notifications look identical.

### 2. Update `shopify-order-notify` (manual sender) to use region routing

- Map `storeKey` to `region_id` 
- Load Discord webhook from `region_settings` instead of global `app_settings`
- Remove the eBay-only restriction (allow any online order)
- Use the same rich embed format

### 3. Delete `shopify-webhook-discord` (legacy, unused)

This function duplicates logic, is eBay-only, uses global config, and is never called from the frontend.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/shopify-webhook/index.ts` | Rewrite `sendDiscordNotification` to build a rich embed with thumbnail + Shopify admin link (matching the flush function's format). Keep barcode SVG attachment. |
| `supabase/functions/shopify-order-notify/index.ts` | Rewrite to: (a) map storeKey→regionId, (b) load webhook from `region_settings`, (c) remove eBay filter, (d) use rich embeds with product images and Shopify link |
| `supabase/functions/shopify-webhook-discord/index.ts` | Delete |
| `supabase/config.toml` | Remove `shopify-webhook-discord` entry |

## Embed Format (all three paths will share this)

- **Title**: Region icon + region name + order type (clickable link to Shopify admin)
- **Thumbnail**: First product image from line items
- **Fields**: Customer, Total, Type, Source, Items list with SKUs
- **Footer**: Order ID
- **Color**: Teal (Hawaii) or Amber (Vegas)
- **Attachment**: Barcode SVG (for immediate + manual, not queued batches)

