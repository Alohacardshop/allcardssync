

# Shopify Inventory Backfill for Hawaii

## Summary

Pull all products from Shopify (Hawaii store) into the local intake_items table with intelligent filtering:
- **Skip**: Untracked inventory (not managed in Shopify)
- **Skip**: 0 quantity items (out of stock)
- **Skip**: Items with quantity > 900 (likely bulk/unlimited items)
- **Pull**: Everything else with valid SKUs

---

## Current State

| Metric | Value |
|--------|-------|
| Items in local DB (Hawaii) | 70 |
| Already synced to Shopify | 70 |
| Last pull timestamp | Never (no SHOPIFY_LAST_PULL_HAWAII setting) |

---

## What Needs to Change

### 1. Update Edge Function: `shopify-pull-products-by-tags/index.ts`

Add three new filter parameters and apply them during processing:

```typescript
// New parameters (with sensible defaults)
minQuantity = 1,        // Skip 0 quantity items
maxQuantity = 900,      // Skip bulk items (>900 qty)
skipUntracked = true    // Skip items not tracked in Shopify inventory
```

**Filter Logic Changes:**

| Current Behavior | New Behavior |
|-----------------|--------------|
| Skips qty = 0 | Skips qty < minQuantity (default 1) |
| No max check | Skips qty > maxQuantity (default 900) |
| Pulls all tracked items | Checks `inventory_management` field to skip untracked |

### 2. Update Frontend: `src/pages/admin/ShopifyBackfill.tsx`

- Update to only show Hawaii (per your request to focus on Hawaii)
- Add filter controls for min/max quantity thresholds
- Add "Skip Untracked" toggle
- Improve results display with filter summary

---

## Technical Details

### Edge Function Changes

**File**: `supabase/functions/shopify-pull-products-by-tags/index.ts`

1. **Add parameters** (lines ~79-88):
```typescript
const { 
  storeKey, 
  gradedTags = ["graded", "PSA"],
  rawTags = ["single"],
  updatedSince,
  maxPages = 50,
  dryRun = false,
  status = 'active',
  skipAlreadyPulled = true,
  // NEW FILTERS
  minQuantity = 1,        // Skip items below this quantity
  maxQuantity = 900,      // Skip items above this quantity  
  skipUntracked = true    // Skip items with inventory_management = null
} = await req.json();
```

2. **Add untracked check** (after line ~268):
```typescript
// Skip untracked variants (inventory not managed by Shopify)
if (skipUntracked && variant.inventory_management === null) {
  console.log(`Skipping variant ${variant.id} (SKU: ${variant.sku}) - inventory not tracked`);
  skippedVariants++;
  continue;
}
```

3. **Add quantity range filter** (modify lines ~310-319):
```typescript
// Filter by quantity range
const locationsToProcess = inventoryLevels.filter(level => {
  const qty = level.available || 0;
  return level.location_id && 
         qty >= minQuantity && 
         qty <= maxQuantity;
});

// Track reason for skip
if (locationsToProcess.length === 0) {
  const hasHighQty = inventoryLevels.some(l => l.available > maxQuantity);
  const hasZeroQty = inventoryLevels.every(l => l.available < minQuantity);
  const reason = hasHighQty ? 'quantity > 900' : (hasZeroQty ? 'quantity = 0' : 'no valid locations');
  console.log(`Skipping variant ${variant.id} (SKU: ${variant.sku}) - ${reason}`);
  skippedVariants++;
  continue;
}
```

4. **Update statistics** to track skip reasons:
```typescript
let skippedUntracked = 0;
let skippedZeroQty = 0;
let skippedHighQty = 0;
```

### Frontend Changes

**File**: `src/pages/admin/ShopifyBackfill.tsx`

1. Remove Las Vegas card (focus only on Hawaii)
2. Add filter controls:
   - Min quantity input (default: 1)
   - Max quantity input (default: 900)
   - Skip untracked toggle (default: true)
3. Pass filter params to edge function
4. Improve results display with breakdown of skipped items

---

## Expected Behavior After Changes

When you run the backfill for Hawaii:

| Items | Action |
|-------|--------|
| SKU with qty = 0 | **Skipped** - out of stock |
| SKU with qty = 1-900 | **Pulled** - added to intake_items |
| SKU with qty > 900 | **Skipped** - likely bulk/unlimited |
| SKU with no inventory tracking | **Skipped** - untracked items |
| SKU with no SKU value | **Skipped** - can't be identified |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/shopify-pull-products-by-tags/index.ts` | Add filter params, quantity range check, untracked check |
| `src/pages/admin/ShopifyBackfill.tsx` | Remove Vegas, add filter controls, improve UI |

---

## Safety Notes

- **Dry run mode** available - preview what would be pulled without actually inserting
- **Upsert behavior** - existing items are updated, not duplicated (uses `upsert_shopify_intake_item` RPC)
- **Background processing** - runs async, returns immediately so it won't timeout
- **Rate limiting** - built-in 250ms throttle respects Shopify's 4 calls/sec limit

