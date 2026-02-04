
# E2E Test Flow Fixes

This plan addresses three issues preventing the E2E test from working correctly.

---

## Issues Summary

| Issue | Location | Problem | Impact |
|-------|----------|---------|--------|
| **1. Queue status mismatch** | `useE2ETest.ts` line 217 | Items inserted as `pending` but processor looks for `queued` | eBay queue never processes |
| **2. Status mapping gap** | `useE2ETest.ts` line 455 | Maps `pending` → `ebay_queued` but `queued` is correct value | Inconsistent UI state |
| **3. Dry run status unhandled** | `useE2ETest.ts` line 447 | Only checks 'synced', not 'dry_run' | Dry-run items show wrong status |

---

## Fix 1: Use Correct Queue Status

**File**: `src/hooks/useE2ETest.ts`

**Change**: In `queueForEbay`, insert with `status: 'queued'` instead of `status: 'pending'`

```typescript
// Line 217 - BEFORE
status: 'pending',

// Line 217 - AFTER  
status: 'queued',
```

---

## Fix 2: Update Status Mapping in loadExistingTestItems

**File**: `src/hooks/useE2ETest.ts`

**Change**: Update the status mapping to handle `queued` instead of `pending`, and also recognize `dry_run` as a synced state:

```typescript
// Lines 447-464 - Updated logic
if (item.ebay_sync_status === 'synced' || item.ebay_sync_status === 'dry_run' || item.ebay_listing_id) {
  status = 'ebay_synced';
} else if (item.ebay_sync_status === 'failed') {
  status = 'ebay_failed';
} else {
  const queueStatus = queueStatusMap.get(item.id);
  if (queueStatus === 'processing') {
    status = 'ebay_processing';
  } else if (queueStatus === 'queued') {  // Changed from 'pending'
    status = 'ebay_queued';
  } else if (queueStatus === 'completed') {
    status = 'ebay_synced';
  } else if (queueStatus === 'failed') {
    status = 'ebay_failed';
  } else if (item.shopify_product_id) {
    status = 'shopify_synced';
  }
}
```

---

## Fix 3: Clean Up Existing Stale Queue Items

After applying the code fixes, the 3 existing items with `status: pending` will remain stuck. Two options:

**Option A** - Delete them via cleanup button (already available in UI)

**Option B** - Fix in database directly:
```sql
UPDATE ebay_sync_queue 
SET status = 'queued' 
WHERE status = 'pending';
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useE2ETest.ts` | Fix status values in `queueForEbay` and `loadExistingTestItems` |

---

## Verification Steps

After implementing:
1. Delete all existing test items via "Delete All Test Items"
2. Generate new test items (e.g., 3 Graded)
3. Click "Sync All New" (Shopify dry run)
4. Verify items show "shopify synced" status
5. Select items and click "Queue Selected" for eBay
6. Verify items show "ebay queued" status
7. Click "Process Queue"
8. Verify items transition to "ebay synced" (with dry run toast)
9. Verify spinner stops after processing completes
