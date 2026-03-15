

# Discord Bot Improvements

## Issues Found

### 1. Massive Code Duplication
`buildOrderEmbed`, `safeString`, `formatMoney`, `extractCustomerName`, `extractLineItemsSummary`, `extractFirstProductImage`, `getOrderType`, `getOrderSource`, `getPaymentStatus`, `getFulfillmentStatus`, `regionMeta`, `orderTypeEmoji`, `orderTypeLabel`, `hasEbayTag` are all **copy-pasted identically** across three files:
- `shopify-webhook/index.ts`
- `flush-pending-notifications/index.ts`
- `shopify-order-notify/index.ts`

**Fix**: Extract all shared helpers into `supabase/functions/_shared/discord-helpers.ts` and import from one place.

### 2. No Cancellation/Refund Notifications
When an order is cancelled or refunded, the `orders/cancelled` and `refunds/create` handlers update inventory but never notify Discord. Staff who already started pulling an order have no way to know it was cancelled.

**Fix**: Send a red-colored Discord embed to the same region channel when a cancellation or refund occurs, with the original order details.

### 3. Customer Name Missing Last Name
`extractCustomerName` only grabs `first_name` -- never includes last name, making it hard to identify customers.

**Fix**: Combine `first_name` + `last_name` when available.

### 4. Hardcoded Role ID in flush-pending-notifications
Line 455 has `hawaii: '852989670496272394'` hardcoded, bypassing the `region_settings` DB lookup. Las Vegas has no hardcoded ID.

**Fix**: Remove the hardcode, use `region_settings` consistently for both regions.

### 5. Admin UI References Old Global Config
`DiscordNotifications.tsx` still reads/writes `app_settings` keys (`discord.webhooks`, `discord.mention`, `discord.templates`) -- the old global config. The edge functions now use per-region `region_settings`. The admin page is effectively disconnected from the actual config.

**Fix**: Rewrite the admin page to manage per-region Discord settings (webhook URL, role ID, enabled) from `region_settings`, with a region selector tab.

### 6. No Shipping Address Preview
For shipping orders, the embed doesn't show the destination state/city. This helps staff prioritize or identify orders.

**Fix**: Add a shipping destination field (city, state) for shipping-type orders.

## Plan

| # | Change | File(s) |
|---|--------|---------|
| 1 | Extract shared Discord helpers to `_shared/discord-helpers.ts` | New file + update 3 edge functions to import |
| 2 | Add cancellation/refund Discord notifications | `shopify-webhook/index.ts` |
| 3 | Fix customer name to include last name | `_shared/discord-helpers.ts` |
| 4 | Remove hardcoded role ID, use DB only | `flush-pending-notifications/index.ts` |
| 5 | Rewrite admin page for per-region config | `DiscordNotifications.tsx` |
| 6 | Add shipping destination field to embeds | `_shared/discord-helpers.ts` |

