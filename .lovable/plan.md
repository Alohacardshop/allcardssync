

# Fix eBay "Pending" Badge to Distinguish Unqueued vs Queued Items

## Problem
Items with `list_on_ebay = true` but `ebay_sync_status = NULL` show a "Pending" badge, which is identical to items with `ebay_sync_status = 'pending'`. This makes it look like something is stuck when really the items were never queued for sync.

## Solution
Update `EbayStatusBadge.tsx` to show two distinct states:

1. **"Not Queued"** (or "eBay ✓") — `list_on_ebay = true`, `ebay_sync_status` is NULL, no listing ID. These items are flagged for eBay but haven't been submitted to the sync queue yet. Use a subtle badge (e.g., muted outline with a shopping bag icon) to indicate "marked but not yet processing."

2. **"Queued" / "Pending"** — `ebay_sync_status = 'pending'` or `'queued'`. These have been submitted and are waiting for the processor.

### File Changes

**`src/components/inventory/EbayStatusBadge.tsx`**
- Move the `syncStatus === 'pending'` check (line 53) BEFORE the fallback catch-all (line 93)
- Change the fallback (line 93-99) from "Pending" to "eBay" with a ShoppingBag icon and muted styling, indicating the item is marked but not yet queued
- This way, items with `ebay_sync_status = 'pending'` show "Pending" with clock icon, while items with NULL status show a distinct "eBay" tag

This is a small, focused change — just reordering the conditions and updating the label/icon of the fallback badge in `EbayStatusBadge.tsx`.

