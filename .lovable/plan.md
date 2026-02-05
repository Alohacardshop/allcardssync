
Goal: remove the “three vertical dots” that are showing up on the LEFT of every row, and keep row actions (Sync + print indicator + menu) grouped cleanly on the RIGHT near the Sync button.

## What’s happening (root cause)
Those “three black dots” are the **row overflow menu icon** (`MoreVertical`).
In the current table row implementation, the grid defines **one** `actions` column, but the row renders **two separate grid children** for actions:
1) a cell for the primary action button (Sync/Retry/Resync)
2) a second cell for the print icon + kebab menu

Because the CSS grid only has one track for `actions`, the second “actions” element **wraps into a new grid row** and starts again at column 1, which makes the kebab icon appear at the far left of each row.

## Implementation changes (no behavior changes)
### 1) Make the Actions column render exactly ONE grid cell
In `InventoryTableView.tsx` → `TableRow`:
- Replace the current fragment under `isColVisible('actions')` that returns two `<div>`s
- With a single `<div>` that contains:
  - the primary action button (or placeholder)
  - the compact print indicator (only when printed)
  - the kebab menu button (MoreVertical)

This keeps all row actions in one place and prevents grid wrapping.

### 2) Fix the header to also render ONE placeholder cell for Actions
In `InventoryTableView.tsx` → sticky header:
- Replace the current `actions` header fragment that renders two `<span aria-hidden="true" />`
- With a single placeholder element so the header has the same number of grid children as the grid template.

### 3) Widen the Actions column so “Sync + icon + menu” fits cleanly
In `src/features/inventory/types/views.ts`:
- Update the `actions` column width from `44px` to something that matches the new combined layout, e.g. `120px` (or `minmax(110px, 120px)`).
Reason: once Sync and kebab are in the same cell, `44px` is too tight and can reintroduce awkward overflow.

(Your previous change to hide `print_status` by default stays as-is.)

## Files to change
1) `src/features/inventory/components/InventoryTableView.tsx`
   - TableRow: merge the two action “cells” into one flex container
   - Header: actions placeholder becomes a single cell
2) `src/features/inventory/types/views.ts`
   - `INVENTORY_COLUMNS`: widen `actions.width`

## Acceptance checks (what we’ll verify after)
- The three dots no longer appear on the left.
- Row actions are grouped on the right: Sync button + (optional) printer icon + kebab menu.
- Row height remains stable (44px) and doesn’t jump/wrap.
- Clicking a row still opens the inspector; clicking buttons/menus still does not.
- Filters, selection, and scroll position remain unchanged.
