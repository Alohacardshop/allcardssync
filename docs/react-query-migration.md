# React Query Migration for Batch UI

## Overview

This document describes the migration from legacy event-driven state management to React Query for the intake batch UI. This migration was implemented to fix a critical race condition where batch items would fail to appear in the UI immediately after being added.

## The Problem: Race Condition

### Symptoms
- Items added to batch didn't appear in the UI immediately
- Users had to manually refresh or wait for background updates
- Inconsistent behavior across different intake components
- UI state and database state were out of sync

### Root Cause
The legacy system used:
1. **Direct RPC calls** to `create_raw_intake_item`
2. **Custom events** (`batchItemAdded`) to notify UI components
3. **Manual state management** with `useState` and `useEffect`
4. **Polling or event listeners** to refresh the batch panel

This created a race condition:
```
User adds item → RPC call → Fire event → Component tries to refresh → 
Database not committed yet → Empty result → UI shows nothing
```

## The Solution: React Query with Optimistic Updates

### Key Components

#### 1. `useAddIntakeItem` Hook
**Location:** `src/hooks/useAddIntakeItem.ts`

**What it does:**
- Wraps `supabase.rpc('create_raw_intake_item')` in a `useMutation`
- Implements **optimistic updates** using `onMutate`
- Adds a **150ms delay** after success for DB commit
- **Invalidates queries** to trigger background refresh
- **Automatic rollback** on error

**Flow:**
```typescript
// 1. Optimistic Update (onMutate)
User clicks "Add to Batch"
  ↓
Hook immediately updates cache with temp item
  ↓
UI shows item instantly with "_optimistic: true" flag

// 2. Server Call (mutationFn)
RPC call to create_raw_intake_item
  ↓
Database commits the item

// 3. Wait & Refresh (onSuccess)
Wait 150ms for DB replication
  ↓
Invalidate queries to trigger background refetch
  ↓
Real data replaces optimistic data

// 4. Error Handling (onError)
If anything fails, rollback to previous state
  ↓
Show error toast
```

**Code Example:**
```typescript
const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();

const handleSubmit = async () => {
  const itemPayload = {
    store_key_in: assignedStore,
    shopify_location_gid_in: selectedLocation,
    quantity_in: 1,
    // ... other fields
  };
  
  await addItem(itemPayload);
  // UI already updated! No need for manual refresh
};
```

#### 2. `useCurrentBatch` Hook
**Location:** `src/hooks/useCurrentBatch.ts`

**What it does:**
- Fetches the current active batch items using `useQuery`
- Subscribes to the shared query key: `['currentBatch', storeKey, locationGid]`
- Automatically updates when queries are invalidated
- Provides `refetch()` for manual refresh

**Configuration:**
```typescript
const { data: batchData, isLoading, refetch } = useCurrentBatch({
  storeKey: assignedStore,
  locationGid: selectedLocation,
  userId: session?.user?.id
});

// staleTime: 60_000 (1 minute)
// refetchOnWindowFocus: true
// refetchOnReconnect: true
```

#### 3. Query Key Factory
**Location:** `src/hooks/useAddIntakeItem.ts` and `src/hooks/useCurrentBatch.ts`

**Shared Query Key:**
```typescript
export const queryKeys = {
  currentBatch: (storeKey?: string | null, locationGid?: string | null) => 
    ['currentBatch', storeKey, locationGid].filter(Boolean),
};
```

This ensures all components watching the same store+location see the same data.

## Migration Checklist

### ✅ Completed Components

#### Intake Components (Using `useAddIntakeItem`)
- ✅ `GradedCardIntake.tsx` - Graded card intake
- ✅ `RawCardIntake.tsx` - Raw card intake
- ✅ `GradedComicIntake.tsx` - Graded comic intake
- ✅ `RawComicIntake.tsx` - Raw comic intake
- ✅ `BulkCardIntake.tsx` - Bulk card intake
- ✅ `OtherItemsEntry.tsx` - Other items intake
- ✅ `PSABulkImport.tsx` - PSA bulk import
- ✅ `TCGPlayerBulkImport.tsx` - TCGPlayer bulk import

#### Batch Display Components (Using `useCurrentBatch`)
- ✅ `CurrentBatchPanel.tsx` - Main batch panel
  - Removed all `fetchRecentItems` functions
  - Removed `batchItemAdded` event listeners
  - Removed manual state setters (`setRecentItems`, `setCounts`, `setLoading`)
  - Uses `refetch()` for manual refresh

### ❌ Legacy Code Removed
- ❌ `window.dispatchEvent(new CustomEvent('batchItemAdded'))` - No longer needed
- ❌ `window.addEventListener('batchItemAdded')` - No longer needed
- ❌ Manual fetch functions in `CurrentBatchPanel`
- ❌ `setInterval` polling in batch components

## How Optimistic Updates Work

### 1. **Immediate UI Update (onMutate)**
```typescript
onMutate: async (newItem) => {
  const queryKey = queryKeys.currentBatch(
    newItem.store_key_in, 
    newItem.shopify_location_gid_in
  );

  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey });

  // Snapshot previous value for rollback
  const previousItems = queryClient.getQueryData(queryKey);

  // Optimistically update cache
  queryClient.setQueryData(queryKey, (old: any) => {
    const optimisticItem = {
      id: `temp-${Date.now()}`,
      ...newItem,
      created_at: new Date().toISOString(),
      _optimistic: true, // Mark as optimistic
    };

    return {
      ...old,
      items: [optimisticItem, ...(old.items || [])],
      counts: {
        ...old.counts,
        activeItems: (old.counts?.activeItems || 0) + 1,
      },
    };
  });

  return { previousItems, queryKey };
}
```

### 2. **Database Commit & Refresh (onSuccess)**
```typescript
onSuccess: async (data, variables, context) => {
  // Wait 150ms for DB commit/replication
  await new Promise(resolve => setTimeout(resolve, 150));

  // Invalidate to trigger background refetch
  if (context?.queryKey) {
    await queryClient.invalidateQueries({ queryKey: context.queryKey });
  }

  toast.success('Item added to batch successfully!');
}
```

### 3. **Error Rollback (onError)**
```typescript
onError: (error, variables, context) => {
  // Rollback optimistic update
  if (context?.previousItems && context?.queryKey) {
    queryClient.setQueryData(context.queryKey, context.previousItems);
  }

  toast.error(`Failed to add item: ${error.message}`);
}
```

## Testing the "Add to Batch" Flow

### End-to-End Test
**Location:** `tests/intake_add_to_batch.spec.ts`

**What it tests:**
1. ✅ Only makes RPC call to `create_raw_intake_item`
2. ✅ Does NOT make any Edge Function calls
3. ✅ Item appears in UI immediately
4. ✅ Success toast is shown

**Run the test:**
```bash
npm run test:e2e
```

### Manual Testing Checklist

1. **Add a graded card:**
   - Navigate to Graded Card Intake
   - Enter PSA cert, price, and cost
   - Click "Add to Batch"
   - ✅ Item appears in Current Batch Panel immediately
   - ✅ Success toast shows
   - ✅ Form resets but keeps vendor selection

2. **Add multiple items quickly:**
   - Add 3-5 items in rapid succession
   - ✅ All items appear in correct order
   - ✅ No race conditions or missing items
   - ✅ Batch count updates correctly

3. **Test error handling:**
   - Disconnect internet
   - Try to add an item
   - ✅ Optimistic item appears briefly
   - ✅ Error toast shows
   - ✅ Optimistic item is removed (rollback)

4. **Test bulk import:**
   - Use TCGPlayer Bulk Import
   - Import 10+ items
   - ✅ Progress bar works
   - ✅ All items appear in batch after import
   - ✅ No duplicate items

## Benefits of This Migration

### 1. **Instant UI Feedback**
Users see items immediately without waiting for database confirmation.

### 2. **Automatic State Synchronization**
React Query handles cache invalidation and background refetching.

### 3. **Reduced Race Conditions**
150ms delay ensures database commits before refetch.

### 4. **Better Error Handling**
Automatic rollback on failure with user-friendly error messages.

### 5. **Simplified Code**
- No more manual event listeners
- No more complex state management
- Fewer bugs and edge cases

### 6. **Better TypeScript Support**
Full type safety with mutation params and responses.

## Best Practices

### When Adding New Intake Components

1. **Import the hook:**
```typescript
import { useAddIntakeItem } from '@/hooks/useAddIntakeItem';
```

2. **Use the mutation:**
```typescript
const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();
```

3. **Create the payload:**
```typescript
const itemPayload = {
  store_key_in: assignedStore,
  shopify_location_gid_in: selectedLocation,
  quantity_in: 1,
  // ... required fields
  main_category_in: mainCategory,
  sub_category_in: subCategory,
  // ... optional fields
};
```

4. **Call the mutation:**
```typescript
try {
  const result = await addItem(itemPayload);
  // Optional: handle success (form reset, etc.)
} catch (error) {
  // Error toast is automatic, but add custom handling if needed
}
```

5. **Show loading state:**
```typescript
<Button disabled={isAdding}>
  {isAdding ? 'Adding...' : 'Add to Batch'}
</Button>
```

### When Displaying Batch Items

1. **Import the hook:**
```typescript
import { useCurrentBatch } from '@/hooks/useCurrentBatch';
```

2. **Use the query:**
```typescript
const { data: batchData, isLoading, refetch } = useCurrentBatch({
  storeKey: assignedStore,
  locationGid: selectedLocation,
  userId: session?.user?.id
});

const items = batchData?.items || [];
const counts = batchData?.counts || { activeItems: 0, totalItems: 0 };
```

3. **Use `refetch()` for manual refresh:**
```typescript
const handleSomeAction = async () => {
  // ... perform action
  await refetch(); // Refresh batch data
};
```

## Troubleshooting

### Issue: Items not appearing immediately
**Check:**
- Is `useAddIntakeItem` being used?
- Is the component using the correct query key?
- Check browser console for errors

### Issue: Items appearing twice
**Check:**
- Make sure legacy event dispatchers are removed
- Verify no duplicate RPC calls

### Issue: Optimistic updates not working
**Check:**
- Query key matches between `useAddIntakeItem` and `useCurrentBatch`
- `onMutate` is returning correct context

### Issue: Items disappearing after add
**Check:**
- 150ms delay in `onSuccess`
- Query invalidation is happening
- Network requests in DevTools

## Future Improvements

1. **Add retry logic** for failed mutations
2. **Implement mutation queuing** for offline support
3. **Add progress indicators** for bulk operations
4. **Optimize query staleness** settings per component
5. **Add mutation logs** for debugging

## Related Documentation

- [React Query Official Docs](https://tanstack.com/query/latest)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Query Invalidation](https://tanstack.com/query/latest/docs/react/guides/query-invalidation)
- `README-QUERY-OPTIMIZATION.md` - General query optimization strategy
- `README-QUERY-OPTIMIZATION-COMPLETE.md` - Polling optimization implementation

---

**Last Updated:** 2025-01-29  
**Migration Status:** ✅ Complete
