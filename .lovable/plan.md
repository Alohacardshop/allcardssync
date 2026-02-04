
# Auto-Update Status After eBay Processing

## Problem
The `processEbayQueue` function already fetches updated data after calling the edge function, but it doesn't recognize `dry_run` as a successful sync status. This causes items to remain stuck in "processing" state until a manual reload.

---

## Root Cause

**Location**: `src/hooks/useE2ETest.ts` lines 273-274

```typescript
// CURRENT - missing 'dry_run' check
const newStatus = updated.ebay_sync_status === 'synced' ? 'ebay_synced' : 
                 updated.ebay_sync_status === 'failed' ? 'ebay_failed' : item.status;
```

The edge function sets `ebay_sync_status: 'dry_run'` for dry run mode (line 337 in `ebay-sync-processor/index.ts`), but the hook only checks for `'synced'`.

---

## Fix

Update the status check in `processEbayQueue` to also recognize `'dry_run'` as a successful sync:

```typescript
// Line 273-274 - AFTER
const newStatus = 
  (updated.ebay_sync_status === 'synced' || updated.ebay_sync_status === 'dry_run') 
    ? 'ebay_synced' 
    : updated.ebay_sync_status === 'failed' 
      ? 'ebay_failed' 
      : item.status;
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useE2ETest.ts` | Update status resolution in `processEbayQueue` to recognize `dry_run` |

---

## Expected Behavior After Fix

1. User clicks "Process Queue"
2. Items transition to "ebay processing" (spinner shown)
3. Edge function runs and sets `ebay_sync_status = 'dry_run'`
4. `processEbayQueue` fetches updated items
5. Status check recognizes `dry_run` as success
6. Items immediately show "ebay synced" (green checkmark)
7. No manual reload required
