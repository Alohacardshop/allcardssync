

## Plan: Unified "Resync All" for Both Shopify and eBay

### Problem
The Shopify "Resync" button only syncs to Shopify. If an item is also listed on eBay, you have to separately hit the eBay Resync button. There's no single action to update both marketplaces at once.

### Proposed Change

**File: `src/features/inventory/hooks/useInventoryMutations.ts`**

Update `resyncMutation` (line ~137) to also queue an eBay resync when the item has an active eBay listing (`list_on_ebay === true` and `ebay_listing_id` exists):

1. After the Shopify resync succeeds, check if the item is listed on eBay
2. If yes, upsert into `ebay_sync_queue` with `action: 'update'` and fire-and-forget invoke `ebay-sync-processor`
3. Update the success toast to say "Resynced to Shopify & eBay" vs just "Shopify"

**File: `src/features/inventory/components/inspector/tabs/OverviewTab.tsx`**

Update the Shopify row's Resync button label/tooltip to indicate it will resync to all active marketplaces when eBay is also enabled.

This keeps both individual resync buttons available while making the main one a convenient "sync everywhere" action.

