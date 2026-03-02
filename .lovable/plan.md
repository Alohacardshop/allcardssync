

## Problem

When you toggle "List on eBay" on an item, it only sets the `list_on_ebay` flag in `intake_items`. Nothing inserts a row into `ebay_sync_queue`, so the `ebay-sync-processor` cron (runs every 3 minutes) never picks it up. The item just sits at "Pending" forever.

## Fix

Modify `toggleListOnEbay` in `src/hooks/useEbayListing.ts` so that when enabling eBay (`!currentValue === true`), it also inserts a row into `ebay_sync_queue` with `action: 'create'` and `status: 'queued'`, and sets `ebay_sync_status: 'queued'` on the intake item. When disabling eBay, it clears the `ebay_sync_status`.

### Changes to `src/hooks/useEbayListing.ts` — `toggleListOnEbay` function:

1. After updating `list_on_ebay`, if enabling:
   - Also update `ebay_sync_status` to `'queued'`
   - Insert a row into `ebay_sync_queue` with `inventory_item_id`, `action: 'create'`, `status: 'queued'`
2. If disabling:
   - Set `ebay_sync_status` to `null`
   - Remove any pending queue entries for this item

The `ebay-sync-processor` cron already runs every 3 minutes and picks up `queued` items from `ebay_sync_queue`, so no other changes are needed — the item will be automatically processed on the next cron cycle.

