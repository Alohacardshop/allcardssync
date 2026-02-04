
# E2E Test Dashboard Improvements

This plan addresses several issues to make the E2E test flow more robust and complete.

---

## Issues Summary

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Missing Shopify queue cleanup | `cleanupTestItems`, `deleteSelectedItems` | Orphan records left in `shopify_sync_queue` |
| 2 | Stale closure in `syncToShopify` | Line 153 | Uses outdated `state.shopifyDryRun` value |
| 3 | Stale closure in `printLabels` | Line 310, 331 | Uses outdated state values |
| 4 | Duplicate queue prevention missing | `queueForEbay` | Multiple clicks create duplicate queue entries |
| 5 | No error display for failed items | UI | Users can't see why sync failed |

---

## Fix 1: Add `shopify_sync_queue` Cleanup

**Files**: `src/hooks/useE2ETest.ts`

Add cleanup for `shopify_sync_queue` in both functions:

**In `cleanupTestItems` (after line 381):**
```typescript
// 2.5. Remove Shopify queue entries
await supabase
  .from('shopify_sync_queue')
  .delete()
  .in('inventory_item_id', testItemIds);
```

**In `deleteSelectedItems` (after line 513):**
```typescript
await supabase.from('shopify_sync_queue').delete().in('inventory_item_id', itemIds);
```

---

## Fix 2: Fix Stale Closure in `syncToShopify`

**File**: `src/hooks/useE2ETest.ts`

The callback uses `state.shopifyDryRun` directly but only has `[state.shopifyDryRun, assignedStore]` in deps. When the function is created, it captures the current value. Need to use functional state access or add proper dependency:

**Current (line 153):**
```typescript
if (state.shopifyDryRun) {
```

**Fix**: Use `setState` with callback pattern and read from passed state, or better - read directly from the state parameter in the callback. Since `syncToShopify` already uses `setState(s => ...)` for updates, we can restructure to check the value at call time:

```typescript
const syncToShopify = useCallback(async (itemIds: string[]) => {
  // Read dry run state synchronously at call time
  let isDryRun = false;
  setState(s => {
    isDryRun = s.shopifyDryRun;
    return { ...s, isShopifySyncing: true };
  });
```

This ensures we get the current value when the function is called, not when it was created.

---

## Fix 3: Fix Stale Closure in `printLabels`

**File**: `src/hooks/useE2ETest.ts`

Same issue - uses `state.printDryRun` and `state.testItems` but captures stale values.

**Fix**: Use the same pattern - read state synchronously at call time:

```typescript
const printLabels = useCallback(async (...) => {
  let isDryRun = false;
  let currentItems: TestItemWithStatus[] = [];
  setState(s => {
    isDryRun = s.printDryRun;
    currentItems = s.testItems;
    return { ...s, isPrinting: true };
  });
```

---

## Fix 4: Prevent Duplicate eBay Queue Entries

**File**: `src/hooks/useE2ETest.ts`

Add upsert logic or check for existing queue entries before inserting.

**Current (line 222-224):**
```typescript
const { error } = await supabase
  .from('ebay_sync_queue')
  .insert(queueItems);
```

**Fix**: Use `upsert` with conflict handling on `inventory_item_id`:
```typescript
const { error } = await supabase
  .from('ebay_sync_queue')
  .upsert(queueItems, { 
    onConflict: 'inventory_item_id',
    ignoreDuplicates: true 
  });
```

---

## Fix 5: Show Sync Errors in UI

**File**: `src/pages/E2ETestPage.tsx`

Add tooltip or inline error display for failed items.

**In the item list (around line 343-346):**
```typescript
<div className="flex items-center gap-2 ml-4">
  <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
  <StatusBadge status={item.status} />
  {(item.status === 'shopify_failed' || item.status === 'ebay_failed') && (
    <Tooltip>
      <TooltipTrigger>
        <AlertTriangle className="h-4 w-4 text-destructive" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px]">
        <p className="text-xs">{item.shopify_sync_error || item.ebay_sync_error || 'Unknown error'}</p>
      </TooltipContent>
    </Tooltip>
  )}
</div>
```

Will require wrapping the page content in `<TooltipProvider>` and importing tooltip components.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useE2ETest.ts` | Fix closures, add Shopify queue cleanup, prevent duplicates |
| `src/pages/E2ETestPage.tsx` | Add error tooltips for failed items |

---

## Implementation Order

1. Fix `cleanupTestItems` and `deleteSelectedItems` to include `shopify_sync_queue`
2. Fix stale closures in `syncToShopify` and `printLabels`
3. Add duplicate prevention to `queueForEbay`
4. Add error tooltips to UI

---

## Verification

After implementation:
1. Generate 3 test items
2. Sync to Shopify (dry run) → should show "shopify synced"
3. Queue for eBay → should show "ebay queued"
4. Click "Queue Selected" again → should NOT create duplicates
5. Process Queue → should show "ebay synced"
6. Delete all → verify `shopify_sync_queue` is also cleaned up
