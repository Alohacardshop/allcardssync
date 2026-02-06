

## Summary
Fix the sync status for Shopify-imported items and clear existing errors so you can monitor for new issues going forward.

## Changes

### 1. Update Database Function
Add `shopify_sync_status = 'synced'` and `last_shopify_synced_at = NOW()` to the `upsert_shopify_intake_item` function so future imports are correctly marked.

### 2. Fix Existing Data
Run a migration that:
- Marks all 1,940 "pending" items with a `shopify_product_id` as "synced"
- Clears the 20 error items (they're all 404s from products no longer in Shopify)

### What the migration will do:

| Status Change | Count | Action |
|--------------|-------|--------|
| `pending` → `synced` | 1,940 | Items imported from Shopify now show correct status |
| `error` → cleared | 20 | Reset to `pending` with error message cleared |

### SQL Summary
```sql
-- 1. Update function to set sync status on import
-- (adds shopify_sync_status and last_shopify_synced_at columns)

-- 2. Fix pending items that came from Shopify
UPDATE intake_items
SET shopify_sync_status = 'synced',
    last_shopify_synced_at = COALESCE(last_shopify_synced_at, NOW())
WHERE shopify_product_id IS NOT NULL
  AND shopify_sync_status = 'pending';

-- 3. Clear all errors (reset to pending)
UPDATE intake_items
SET shopify_sync_status = 'pending',
    last_shopify_sync_error = NULL
WHERE shopify_sync_status IN ('error', 'failed');
```

After this runs, your Shopify Status column will accurately show:
- **Synced** for items linked to Shopify products
- **Pending** for items that need to be pushed to Shopify
- Clean slate for errors - any new errors will be genuine issues

