

# Split Bulk Resync into Shopify / eBay / Both

## Current State
The "Resync" button in the bulk actions toolbar only syncs selected items to **Shopify**. There is no bulk eBay resync option — only individual item resync exists via `useEbayListing.resyncToEbay()`.

## Plan

### 1. Replace single Resync button with a dropdown menu
In `BulkActionsToolbar.tsx`, replace the current "Resync" button with a dropdown (using the existing `DropdownMenu` component) containing three options:
- **Resync Shopify** — current behavior
- **Resync eBay** — new: queues selected items for eBay update sync
- **Resync Both** — runs both Shopify + eBay resync

### 2. Add bulk eBay resync handler
In the inventory page (`src/pages/Inventory.tsx` and `src/features/inventory/hooks/useInventoryMutations.ts`), add a `handleResyncEbay` function that:
- Filters selected items to those with `list_on_ebay = true` and an existing eBay listing
- For each item, upserts into `ebay_sync_queue` with action `'update'` and status `'queued'`
- Updates `ebay_sync_status` to `'queued'` on the intake items
- Fires `ebay-sync-processor` (fire-and-forget) to kick off processing
- Shows toast with count of items queued

### 3. Update props and wiring
- Add `onResyncShopify`, `onResyncEbay`, `onResyncBoth` callbacks (or pass a single `onResyncSelected(target: 'shopify' | 'ebay' | 'both')` to keep it simple)
- Wire through `BulkActionsToolbar` → `InventoryBulkBar` → page-level handlers
- The "Both" option calls Shopify resync first, then queues eBay resync

### 4. UI Details
- Dropdown trigger shows the `RotateCcw` icon with label "Resync ▾"
- Three menu items: "Shopify", "eBay", "Both Marketplaces"
- Disabled state follows existing `bulkSyncing` flag

