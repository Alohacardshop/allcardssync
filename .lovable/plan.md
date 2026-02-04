
# Fix eBay Queue Foreign Key Errors & Hidden Items

## Problem

Two related issues:

1. **Foreign Key Errors**: When queueing for eBay, the system fails with `"Key is not present in table intake_items"` because `state.testItems` contains stale IDs for items that were already deleted from the database.

2. **Hidden Items in Queue Monitor**: The `EbaySyncQueueMonitor` shows queue entries where the linked `intake_item` no longer exists (or is deleted), displaying them with just the UUID.

---

## Root Causes

| Issue | Location | Cause |
|-------|----------|-------|
| FK Violation | `useE2ETest.ts` line 227-232 | `queueForEbay` inserts without verifying items still exist in DB |
| Hidden Items | `EbaySyncQueueMonitor.tsx` line 53-73 | Query doesn't filter out orphan queue records |
| Stale State | `useE2ETest.ts` line 270 | `processEbayQueue` uses `state.testItems` which may contain deleted items |

---

## Fix 1: Validate Items Before Queueing

**File**: `src/hooks/useE2ETest.ts`

Before inserting into `ebay_sync_queue`, verify the items still exist in the database:

```typescript
const queueForEbay = useCallback(async (itemIds: string[]) => {
  try {
    // Verify items still exist in database before queueing
    const { data: existingItems } = await supabase
      .from('intake_items')
      .select('id')
      .in('id', itemIds)
      .is('deleted_at', null);
    
    const validIds = (existingItems || []).map(i => i.id);
    
    if (validIds.length === 0) {
      toast.error('No valid items to queue - items may have been deleted');
      return;
    }
    
    if (validIds.length < itemIds.length) {
      toast.warning(`${itemIds.length - validIds.length} item(s) were skipped (already deleted)`);
    }
    
    const queueItems = validIds.map(id => ({
      inventory_item_id: id,
      action: 'create' as const,
      status: 'queued',
      retry_count: 0,
      max_retries: 3
    }));
    
    // ... rest of upsert logic
  }
}, []);
```

---

## Fix 2: Filter Orphan Queue Records

**File**: `src/components/admin/EbaySyncQueueMonitor.tsx`

Add a filter to exclude queue entries where the linked `intake_item` is null or deleted:

```typescript
const { data: queueItems, isLoading, refetch } = useQuery({
  queryKey: ['ebay-sync-queue', selectedStatus],
  queryFn: async () => {
    let query = supabase
      .from('ebay_sync_queue')
      .select(`
        *,
        intake_item:intake_items!inner(sku, psa_cert, brand_title, subject, deleted_at)
      `)
      .is('intake_item.deleted_at', null)  // Exclude deleted items
      .order('queue_position', { ascending: true })
      .limit(100);
    // ...
  }
});
```

The `!inner` modifier makes it an inner join, which will exclude queue entries where the intake_item doesn't exist.

---

## Fix 3: Refresh State After Queue Processing

**File**: `src/hooks/useE2ETest.ts`

In `processEbayQueue`, use fresh item IDs from state (we already fixed this with the setState callback pattern, but need to also handle the testItemIds reference):

```typescript
const processEbayQueue = useCallback(async () => {
  let testItemIds: string[] = [];
  setState(s => {
    testItemIds = s.testItems.map(i => i.id);
    return { ...s, isEbaySyncing: true };
  });
  // ... rest uses testItemIds which is now fresh
}, []);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useE2ETest.ts` | Validate items before queueing, fix stale testItemIds reference |
| `src/components/admin/EbaySyncQueueMonitor.tsx` | Use inner join to exclude orphan/deleted items |

---

## Expected Behavior After Fix

1. **Queueing**: Only valid, existing items are queued; deleted items are skipped with a warning
2. **Queue Monitor**: Only shows items that have a valid linked `intake_item`
3. **No FK Errors**: Foreign key violations eliminated because we validate before insert
4. **Clean Display**: No more "hidden" items with just UUIDs showing
