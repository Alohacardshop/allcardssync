

# Inventory Filters & Performance Improvements

## Current State

The inventory system has two pages: the **active** one at `src/features/inventory/pages/InventoryPage.tsx` (827 lines) and a **dead** legacy one at `src/pages/Inventory.tsx` (1669 lines) that is no longer routed. The active page uses `InventoryFiltersBar`, `MoreFiltersPopover`, `QuickFilterPresets`, and `useInventoryListQuery`.

## Issues Found

### 1. Dead code: Legacy Inventory page
`src/pages/Inventory.tsx` (1669 lines) is never imported. It duplicates filter logic, handlers, and UI. Should be deleted.

### 2. Type filter buried in "More Filters"
You asked about filtering Raw vs Graded -- that filter exists but is hidden inside the "More Filters" popover, requiring two clicks to access. It should be promoted to the main filter bar for one-click access.

### 3. Collection filter calls an Edge Function on every query
In `useInventoryListQuery.ts` (line 176), filtering by Shopify collection invokes `fetch-collection-products` on every page load/filter change. This adds 500ms-2s latency per query. The product-to-collection mapping should be cached client-side.

### 4. Location availability pre-queries are unbounded
Lines 129-161 in `useInventoryListQuery.ts` fetch ALL inventory levels from `shopify_inventory_levels` before running the main query. For large inventories this returns thousands of rows just to build an ID list. This should use a database function or subquery instead.

### 5. No filter state persistence
When navigating away and back, all filters reset (except batch filter). Users lose their working context.

### 6. Quick filter presets don't sync with filter bar
Applying a quick filter sets `activeQuickFilter` state, but the filter bar shows separate chips. The two systems are loosely coupled, which can confuse users.

## Proposed Improvements

### A. Promote Type filter to main bar
Move the Raw/Graded/All toggle out of MoreFiltersPopover and into the main filter row in `InventoryFiltersBar.tsx` as a segmented control or Select dropdown, right after the Status filter. This is a high-use filter that shouldn't require opening a popover.

### B. Delete legacy Inventory page
Remove `src/pages/Inventory.tsx` entirely. It's 1669 lines of dead weight.

### C. Cache collection product IDs
In `useInventoryListQuery`, cache the `fetch-collection-products` result using a separate React Query hook with a 5-minute stale time, so switching back to the same collection doesn't re-invoke the Edge Function.

### D. Persist filter state to URL params
Store active filters (status, type, location, collection, tags) as URL search params. This lets users bookmark filtered views, share links, and preserves state across navigation.

### E. Create a database function for location availability filtering
Replace the two-step approach (fetch all levels, then filter by IDs) with a Postgres function that returns filtered intake_items directly using a JOIN, eliminating the extra round-trip and unbounded ID list.

## Implementation Order

1. **Promote Type filter to main bar** -- small UI change, immediate UX win
2. **Delete legacy Inventory page** -- cleanup, no risk
3. **Cache collection filter** -- performance, moderate effort
4. **Persist filters to URL** -- UX improvement, moderate effort
5. **Database function for availability** -- performance, requires Supabase migration

### Files affected:
- `src/features/inventory/components/InventoryFiltersBar.tsx` -- add Type toggle
- `src/components/inventory/MoreFiltersPopover.tsx` -- remove Type section
- `src/pages/Inventory.tsx` -- delete entirely
- `src/hooks/useInventoryListQuery.ts` -- cache collection, optimize availability
- `src/features/inventory/pages/InventoryPage.tsx` -- URL param persistence

