

# Code Review: Clear Errors & Overall System Health

## Current State Summary

The system is in **good health overall**. Here is the current data breakdown:

| Status | Count | Notes |
|--------|-------|-------|
| synced | 3,331 | Healthy |
| removal_pending | 62 | 61 deleted items + 1 orphan |
| pending | 40 | No product ID - genuine pending items |
| removed | 4 | Properly completed removals |
| success | 1 | Stale status from legacy function |
| error/failed | 0 | Clean |
| Dead Letter | 0 | Clean |
| Retry Jobs | 0 | Clean |

---

## Issues Found

### 1. Clear Errors: Missing Webhook Stats Refetch (LOW)
**File:** `src/components/admin/SyncHealthDashboard.tsx`

After clearing dead letter events, only `refetchErrorCount()` is called. The webhook stats query (`webhook-stats`) is **not refetched**, so the "Dead Letter" card and the error count in the button would show stale data until the next 30-second auto-refresh.

**Fix:** Also invalidate/refetch the `webhook-stats` query after clearing. This requires adding `useQueryClient` and calling `queryClient.invalidateQueries({ queryKey: ['webhook-stats'] })`.

### 2. Clear Errors: No Confirmation Dialog (LOW)
The "Clear Errors" button performs a destructive action (deleting dead letter records, resetting statuses) without asking for confirmation. Adding an `AlertDialog` would prevent accidental clicks.

### 3. Inconsistent Status: `success` vs `synced` (LOW)
One item has `shopify_sync_status = 'success'` -- this comes from the `admin-relink-graded-by-cert` edge function which uses `'success'` instead of `'synced'`. This is inconsistent but harmless since the item is deleted. Should be fixed in the edge function to use `'synced'` for consistency.

### 4. Orphaned `removal_pending` Item (LOW)
One item (SKU `95614274`) is in `removal_pending` status but is **not deleted** and has **no `shopify_product_id`**. This is a stuck/orphaned record that should be cleaned up to either `pending` or `removed`.

### 5. Dead Letter Card Not Showing Sync Error Count (COSMETIC)
The "Dead Letter" summary card only shows failed webhook events. It doesn't reflect intake sync errors. The button shows the combined count, but the dashboard cards don't give a quick visual for sync errors specifically. A dedicated "Sync Errors" card would improve visibility.

---

## Proposed Changes

### Fix 1: Refetch all relevant queries after clearing errors
Add `useQueryClient` to `SyncHealthDashboard` and invalidate both `webhook-stats` and `sync-error-count` queries after the clear operation completes.

### Fix 2: Add confirmation dialog before clearing
Wrap the "Clear Errors" button action in an `AlertDialog` to prevent accidental data deletion. The dialog will show exactly what will be cleared (X dead letter events, Y sync errors).

### Fix 3: Fix `admin-relink-graded-by-cert` status value
Change `shopify_sync_status: 'success'` to `shopify_sync_status: 'synced'` in the edge function for consistency.

### Fix 4: Clean up the orphaned `removal_pending` item
Update the single orphaned item (SKU `95614274`, no product ID, not deleted) to `shopify_sync_status = 'pending'`.

### Fix 5: Add a Sync Errors summary card (optional)
Add a 6th summary card showing the count of items in `error`/`failed` sync status, so it is visible at a glance alongside Dead Letter count.

---

## Technical Details

### SyncHealthDashboard.tsx Changes
- Import `useQueryClient` from `@tanstack/react-query`
- Import `AlertDialog` components from UI library
- Add `queryClient.invalidateQueries()` call in `clearRecentErrors` for keys: `webhook-stats`, `sync-error-count`, `reconciliation-runs`, `store-reconciliation-summary`
- Wrap the clear button with `AlertDialog` for confirmation
- Add a "Sync Errors" summary card using the existing `syncErrorCount` state

### Edge Function Fix
- **File:** `supabase/functions/admin-relink-graded-by-cert/index.ts` (line ~168)
- Change `shopify_sync_status: 'success'` to `shopify_sync_status: 'synced'`

### Data Cleanup
- Update 1 orphaned `removal_pending` item to `pending` status (SKU `95614274`)

