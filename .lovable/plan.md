

# Two Changes: Inventory Type/Category Column + Discord Notification Controls

## 1. Add "Type" column to inventory table

Currently the inventory list shows SKU, Title, Location, Price, Qty, Shopify, eBay, etc. but there's no column showing **what the item is** (Card vs Comic) or **how it's graded** (Raw vs Graded).

### What to add
A new `type` column between Title and Location that shows two pieces of info as compact badges:
- **Category badge**: `main_category` value (e.g., "Sports", "TCG", "Comics") -- color-coded
- **Type badge**: `type` field (Raw/Graded) -- with grade info from `grade` field when graded

Example cell: `Sports · PSA 10` or `TCG · Raw` or `Comics · CGC 9.8`

### Files to change
| File | Change |
|------|--------|
| `src/features/inventory/types/views.ts` | Add `'type'` to `InventoryColumn` union + add column config entry (default visible, ~110px) |
| `src/features/inventory/components/InventoryTableView.tsx` | Add rendering logic for the new column -- show `main_category` + type/grade badges |

## 2. Admin panel to control cancellation notifications per region

Instead of hardcoding cancellation notifications on/off, add a toggle per region in the Discord admin panel.

### What to add
A new `discord.notify_cancellations` setting key per region, loaded/saved alongside the existing webhook config. The edge function checks this setting before sending.

### Files to change
| File | Change |
|------|--------|
| `src/pages/admin/DiscordNotifications.tsx` | Add a "Notify on Cancellations" switch per region, save as `discord.notify_cancellations` in `region_settings` |
| `supabase/functions/shopify-webhook/index.ts` | Before calling `sendCancellationNotification`, check `region_settings` for `discord.notify_cancellations` -- skip if false/missing |
| `supabase/functions/_shared/discord-helpers.ts` | No changes needed -- `sendCancellationNotification` already exists |

