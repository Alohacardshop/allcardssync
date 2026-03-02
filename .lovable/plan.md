

## Problem

The default column set (`WORKBENCH_COLUMNS`) used on the inventory page doesn't include `ebay_status`. So the eBay sync badge only appears if the user manually adds the column via the Column Chooser. Shopify status is included by default, but eBay is not.

## Fix

**File: `src/features/inventory/pages/InventoryPage.tsx`** (line 69-78)

Add `'ebay_status'` to the `WORKBENCH_COLUMNS` array, placing it right after `'shopify_status'`:

```typescript
const WORKBENCH_COLUMNS: InventoryColumn[] = [
  'checkbox',
  'sku',
  'title',
  'location',
  'price',
  'quantity',
  'shopify_status',
  'ebay_status',    // ← add this
  'actions',
];
```

This is a one-line addition. The `EbayStatusBadge` component and the table cell rendering for `ebay_status` already exist — they're just hidden because the column isn't in the default set.

**Note:** Users who have already loaded the page will have the old default cached in React state. If column preferences are persisted (e.g., in a saved view or localStorage), those users may need to reset their view to pick up the new default.

