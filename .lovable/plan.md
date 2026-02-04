
# Inventory Management Overhaul Plan

## Overview
This plan addresses three interconnected improvements:
1. **Location visibility** - Show item locations in the inventory and allow viewing items across all locations
2. **UI simplification** - Remove redundant category tabs and consolidate into unified filters
3. **Sealed product handling** - Ensure sealed products are properly categorized

## Phase 1: Location Name Resolution

### Problem
The import correctly pulls from all 4 Hawaii locations (Ward, Windward, Warehouse, etc.), but:
- Location names aren't stored or displayed
- Users can only view items from their currently selected location
- The `shopify_location_cache` table exists but isn't being populated

### Solution

**1.1 Populate Location Cache**
- Modify the `shopify-locations` edge function to cache location data in `shopify_location_cache` table when fetched
- Add a scheduled task or on-demand refresh to keep cache updated

**1.2 Add Location Display to Inventory Items**
- Update `InventoryItemCard` to show the location name badge
- Create a `useLocationNames` hook that fetches and caches location GID-to-name mappings
- Display location as a small badge next to the SKU (e.g., "Ward", "Windward")

**1.3 Add "All Locations" View Option**
- Add a new location filter option: "All Locations"
- When selected, remove the `.eq('shopify_location_gid', locationGid)` filter
- Group or badge items by location for clarity

## Phase 2: Inventory UI Simplification

### Current Structure
```text
+------------------------------------------+
| Inventory Management                      |
+------------------------------------------+
| [Inventory] [Analytics] [Printer]         |  <- Main tabs (keep)
+------------------------------------------+
| Category Card                             |
| [Raw] [Graded] [Sealed] [Raw C.] [Grd C.] |  <- REMOVE these tabs
+------------------------------------------+
| Quick Filters: [Ready to Sync] [Errors].. |  <- Keep (primary nav)
+------------------------------------------+
| Filters & Search Card                     |
| [Search] [Status] [Type] [Batch]          |  <- Consolidate here
| [Shopify] [eBay] [Print] [Date]           |
+------------------------------------------+
```

### Proposed Structure
```text
+------------------------------------------+
| Inventory Management                      |
+------------------------------------------+
| [Inventory] [Analytics] [Printer]         |
+------------------------------------------+
| Quick Filters: [Ready to Sync] [Errors].. |  <- Move up, primary nav
+------------------------------------------+
| Filters Card                              |
| [Search] [Status] [Type] [Category] [Loc] |  <- Add Location filter
| [Shopify] [eBay] [Print] [Date] [Batch]   |
+------------------------------------------+
```

### Changes

**2.1 Remove Category Tabs Card**
- Delete the "Category" card with 5 tabs (Raw, Graded, Sealed, Raw Comics, Graded Comics)
- This removes ~50 lines from Inventory.tsx

**2.2 Add Category Dropdown Filter**
- Add new filter dropdown with options:
  - All Categories
  - TCG Cards
  - Sealed Products
  - Comics
- Combine with existing Type filter (Raw/Graded) for full coverage

**2.3 Add Location Dropdown Filter**
- Add new filter dropdown with options:
  - All Locations (default when entering page)
  - Ward
  - Windward
  - Warehouse
  - (dynamically populated from available locations)

**2.4 Update Query Logic**
- Modify `useInventoryListQuery` to:
  - Make locationGid optional
  - Add categoryFilter parameter
  - Handle "All" options for both

**2.5 Move Quick Filters Up**
- Position Quick Filter Presets immediately after the main tabs
- They become the primary workflow navigation

## Phase 3: Sealed Product Handling

### Current Issue
- Only 6 sealed items imported (detected by Shopify tag "Sealed")
- No `main_category` or `sub_category` set on imported items
- Sealed tab relies solely on `shopify_snapshot->>'tags' ILIKE '%sealed%'`

### Solution

**3.1 Improve Sealed Detection**
- Update the category dropdown to detect sealed products via:
  - Primary: `shopify_snapshot->>'tags' ILIKE '%sealed%'`
  - Secondary: Quantity > 1 (most sealed products have multiple units)
  - Fallback: Product title contains "booster", "box", "pack", "sealed"

**3.2 Update Import to Set Categories**
- Modify `shopify-pull-products-by-tags` edge function to:
  - Detect sealed products during import
  - Set `main_category = 'sealed'` when detected
  - This allows filtering without relying on runtime tag parsing

**3.3 Add Quick Filter for Sealed**
- Add "Sealed Products" preset to QuickFilterPresets
- Filter: `categoryFilter: 'sealed'`

## Implementation Order

| Step | Task | Effort |
|------|------|--------|
| 1 | Create `useLocationNames` hook for GID-to-name mapping | Small |
| 2 | Update `shopify-locations` to cache names in database | Small |
| 3 | Add location badge to `InventoryItemCard` | Small |
| 4 | Add Location dropdown filter to Inventory.tsx | Medium |
| 5 | Update `useInventoryListQuery` for optional location | Medium |
| 6 | Add Category dropdown filter | Medium |
| 7 | Remove Category tabs card | Small |
| 8 | Update import to set `main_category` for sealed | Small |
| 9 | Add "Sealed Products" quick filter preset | Small |
| 10 | Test end-to-end with all locations visible | Medium |

## Technical Notes

### Database Changes Required
- Ensure `shopify_location_cache` is populated on location fetch
- Consider adding index on `intake_items(store_key, main_category)` for category filtering

### Query Performance
- Adding "All Locations" view may increase result set size
- Virtual list already implemented - should handle larger datasets
- May need to increase page size or add location-based grouping

### Filter State Management
- New filters need to be added to:
  - Component state in Inventory.tsx
  - Query key in useInventoryListQuery
  - URL params for shareable filter states (optional enhancement)
