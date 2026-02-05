
# Add Batches to Main Navigation

## Problem
The `/batches` route is defined but not visible in the main Sidebar or BottomNav. Users have no obvious way to navigate there except via dashboard quick actions, keyboard shortcuts, or command palette.

## Solution
Add a "Batches" link to both the Sidebar and BottomNav navigation components.

---

## Changes

### 1. Update Sidebar Navigation (`src/components/layout/Sidebar.tsx`)

Add Batches to the `NAV_ITEMS` array:
- Add `Archive` icon import from lucide-react
- Add `Archive` to `ICON_MAP`
- Insert a new nav item after Inventory:
  ```
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: 'Archive' }
  ```

### 2. Update Bottom Navigation (`src/components/layout/BottomNav.tsx`)

Add Batches to the `MORE_ITEMS` array (the "More" sheet menu):
- Add `Archive` icon import from lucide-react
- Add `Archive` to `ICON_MAP`
- Insert a new item:
  ```
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: 'Archive' }
  ```

---

## Technical Details

| File | Change |
|------|--------|
| `src/components/layout/Sidebar.tsx` | Add `Archive` import, update `ICON_MAP`, add batches to `NAV_ITEMS` |
| `src/components/layout/BottomNav.tsx` | Add `Archive` import, update `ICON_MAP`, add batches to `MORE_ITEMS` |

The route already exists at `/batches` via `PATHS.batches` - only navigation links are missing.
