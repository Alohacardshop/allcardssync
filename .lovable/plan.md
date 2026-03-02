

## Problem

There's 1 active lot (`LOT-20260302-009246`) with **0 items** — it's an empty/stale lot that should have been cleaned up. The "Active Lots" stat card on the dashboard shows "1" but is not clickable, so you can't see or manage these lots.

## Fix

### 1. Make the "Active Lots" stat card clickable
- Wrap the `StatCard` for "Active Lots" in a `Link` to a new route (or a dialog)
- Clicking it opens a popover/dialog listing all active lots with their details

### 2. Add an Active Lots management dialog
- Create a small dialog/sheet component that shows when clicking "Active Lots"
- Lists each active lot: lot number, created date, item count
- Each lot has a **Delete** button (sets `status = 'closed'` or deletes the lot)
- After deletion, invalidate the `dashboard-stats` query to refresh the count

### 3. Auto-cleanup empty lots
- When fetching active lots for the stat, also consider filtering out lots with 0 items that are older than a threshold — but this is optional since the user wants manual control

## Technical approach

**`DashboardHome.tsx`:**
- Add state for dialog open/close
- Replace the "Active Lots" `StatCard` with a clickable version
- Add a new `ActiveLotsDialog` component inline or imported

**`ActiveLotsDialog` (new component or inline):**
- Fetches `intake_lots` where `status = 'active'`, joined with item counts
- Displays lot number, creation date, item count per lot
- Delete button calls `supabase.from('intake_lots').update({ status: 'closed' }).eq('id', lotId)`
- Uses `useQueryClient().invalidateQueries` to refresh dashboard stats

**Immediate data fix:**
- Close the empty stale lot `f9a3a58c-cb9f-4b36-895b-ed7a052ff462` via UPDATE (using insert tool, not migration)

