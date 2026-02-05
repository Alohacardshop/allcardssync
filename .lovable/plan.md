
# Batch Management Improvements

## The Problem

The Batches page shows **8 active lots** that are effectively stale/abandoned:
- 6 have **0 items** (empty batches that were never used)
- 1 has **394 active items** still sitting in it (LOT-20251029-000343)
- Some are **months old** (dating back to September 2025)

These "active" batches accumulate because there's no workflow to close or archive them, and the UI doesn't make it easy to identify or clean them up.

## Root Causes

1. **No "Close Batch" action** - Staff can't manually mark a batch as closed
2. **Filter dropdown has wrong status values** - Shows "completed/archived" but database uses "closed/deleted"
3. **Batch details show deleted items** - Makes it hard to see what's actually left
4. **No visual distinction for stale batches** - Old empty batches look the same as recent ones
5. **Bulk cleanup not available** - Can't select multiple empty batches to delete

---

## Proposed Solution

### 1. Fix Status Filter Options
Update the dropdown to match actual database statuses:
- `all` → All Status
- `active` → Active
- `closed` → Closed  
- `deleted` → Deleted

### 2. Add "Close Batch" Action
Allow authorized users to manually close active batches:
- Button appears for active batches with 0 remaining items
- Sets `status = 'closed'` with timestamp in notes
- No admin required (normal workflow action)

### 3. Add Stale Batch Indicator
Visual warning for active batches that are:
- Empty (`total_items = 0` or no active items)
- Old (created > 7 days ago and still active)

Show amber badge: "Stale - 0 items" or "Stale - 45 days old"

### 4. Add Bulk Selection for Cleanup
- Checkbox column for batch selection
- "Delete Selected" button for admins
- "Close Selected" button for empty batches

### 5. Filter Deleted Items in Details View
Update `fetchLotItems` query to exclude `deleted_at IS NOT NULL` items by default, with toggle to show all.

---

## Technical Details

### Database Changes
None required - uses existing `status` field and `admin_delete_batch` RPC.

New RPC function needed:
```sql
CREATE OR REPLACE FUNCTION close_empty_batch(lot_id_in uuid)
RETURNS void AS $$
BEGIN
  UPDATE intake_lots 
  SET status = 'closed',
      notes = COALESCE(notes || ' | ', '') || 'Manually closed at ' || now()::text,
      updated_at = now()
  WHERE id = lot_id_in 
    AND status = 'active'
    AND (total_items = 0 OR NOT EXISTS (
      SELECT 1 FROM intake_items 
      WHERE lot_id = lot_id_in AND deleted_at IS NULL
    ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### UI Component Changes

**Status filter fix:**
```tsx
<select value={statusFilter} onChange={...}>
  <option value="all">All Status</option>
  <option value="active">Active</option>
  <option value="closed">Closed</option>
  <option value="deleted">Deleted</option>
</select>
```

**Stale badge logic:**
```tsx
const isStale = lot.status === 'active' && (
  lot.total_items === 0 || 
  differenceInDays(new Date(), new Date(lot.created_at)) > 7
);
```

**Items query fix:**
```tsx
.from('intake_items')
.select('*')
.eq('lot_id', lotId)
.is('deleted_at', null)  // Add this filter
```

### Files to Modify
- `src/pages/Batches.tsx` - Main batch management page
- New migration for `close_empty_batch` RPC function
- `src/integrations/supabase/types.ts` - Add RPC type

---

## Summary

| Change | Purpose |
|--------|---------|
| Fix status filter values | Match actual DB statuses |
| Add "Close Batch" action | Let staff close empty batches |
| Add stale indicators | Highlight batches needing attention |
| Add bulk selection | Enable cleanup of multiple batches |
| Filter deleted items | Show accurate item counts in details |

This will help you identify and clean up the 8 stale active batches, and prevent accumulation of abandoned batches in the future.
