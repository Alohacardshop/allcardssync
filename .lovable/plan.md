

## Problem

When you re-scan a graded comic (cert 146094215), the item exists in a **closed** lot (`a856bfe6`). The `create_raw_intake_item` RPC fires its `ON CONFLICT DO UPDATE` clause, which updates fields like quantity, subject, grade, etc. — but **does not update `lot_id`**. The item stays assigned to the closed lot and never appears in the current batch.

The client-side duplicate detection in `useAddIntakeItem.ts` (lines 61-173) should catch this first, but either it's not triggering or its lot reassignment is also failing. Either way, the RPC itself needs to be the safety net.

## Root Cause

In `create_raw_intake_item`, the `ON CONFLICT DO UPDATE SET` block is missing `lot_id` reassignment. When a duplicate is found, the item needs to be moved into the user's current active lot.

## Plan

### 1. Fix `create_raw_intake_item` RPC — reassign lot on conflict

Update the RPC to:
- Call `get_or_create_active_lot` at the top of the function to get the current active lot ID
- Use that lot ID in the INSERT (so new items get lot assignment)
- Add `lot_id = v_active_lot_id` to the `ON CONFLICT DO UPDATE SET` clause

This ensures that both new inserts AND conflict-updates always land in the active lot.

### 2. Add guard in `useAddIntakeItem.ts` duplicate path

In the duplicate detection path (line 126), add a null check for `activeLotId`. If `get_or_create_active_lot` returns empty/undefined, throw an error instead of silently passing `undefined` to the update:

```typescript
if (!activeLotId) {
  throw new Error('Failed to get or create active lot');
}
```

Same fix for the race-condition fallback path (~line 252).

### 3. Fix existing orphaned item

Run a data fix to move the stranded item (`5d89030b`) into a new active lot so it appears in the current batch.

### Technical Details

**Database migration** — Update `create_raw_intake_item`:
```sql
-- Add at top of function body:
v_active_lot_id uuid;
...
SELECT id INTO v_active_lot_id 
FROM get_or_create_active_lot(store_key_in, shopify_location_gid_in);

-- Add lot_id to INSERT column list and VALUES
-- Add to ON CONFLICT DO UPDATE SET:
lot_id = v_active_lot_id,
```

**Files to modify:**
- `src/hooks/useAddIntakeItem.ts` — null guard for `activeLotId` (2 locations)
- Database migration for `create_raw_intake_item` RPC
- Data fix for the stranded item

