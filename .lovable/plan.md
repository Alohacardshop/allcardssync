

## Summary
You want the category filter to dynamically show **all available categories from Shopify** instead of the current hardcoded 3 options (TCG, Comics, Sealed). Looking at your data, the `category` column in `intake_items` already contains Shopify product types like:
- Pokemon (718 items)
- BASEBALL CARDS (122 items)  
- BASKETBALL CARDS (40 items)
- FOOTBALL CARDS (31 items)
- Comics (11 items)
- And many more...

## What I'll Do

**Make the category filter dynamic** - fetch actual categories from your inventory data and display them grouped for easy selection.

### 1. Create a new hook to fetch available categories
A new `useCategoryFilter` hook will query distinct categories from `intake_items` with their counts, similar to how `useShopifyTags` works.

### 2. Update the filter UI
The "Category" dropdown in the More Filters popover will:
- Show all available categories dynamically
- Group them by main category (TCG vs Comics vs Sports)
- Show item counts next to each option
- Support the existing "all" option plus dynamic categories

### 3. Update the query logic
Modify `useInventoryListQuery.ts` to filter by the actual `category` column value when a specific category is selected.

---

## Technical Details

### New hook: `src/hooks/useCategoryFilter.ts`
```typescript
// Query distinct categories with counts from intake_items
// Returns: [{ category: "Pokemon", count: 718 }, { category: "BASEBALL CARDS", count: 122 }, ...]
```

### Files to modify:

| File | Change |
|------|--------|
| `src/features/inventory/types.ts` | Change `InventoryCategoryFilter` from union type to `'all' \| string` to support dynamic values |
| `src/hooks/useCategoryFilter.ts` | New hook to fetch categories with counts |
| `src/components/inventory/MoreFiltersPopover.tsx` | Accept dynamic categories, render grouped dropdown |
| `src/features/inventory/components/InventoryFiltersBar.tsx` | Pass categories from hook to popover |
| `src/features/inventory/pages/InventoryPage.tsx` | Call the new hook, pass data down |
| `src/hooks/useInventoryListQuery.ts` | Update category filter logic to match exact `category` column value |
| `src/components/inventory/ActiveFilterChips.tsx` | Display dynamic category labels |

### UI Changes
The Category dropdown will transform from:
```text
All Categories
TCG
Comics  
Sealed
```

To:
```text
All Categories
── TCG ──
  Pokemon (718)
  TCG Cards (194)
  Lorcana
  One Piece
── Sports ──
  BASEBALL CARDS (122)
  BASKETBALL CARDS (40)
  FOOTBALL CARDS (31)
  HOCKEY CARDS (1)
── Other ──
  Comics (11)
  Collectibles
```

### Database efficiency
Will use a database function (like `get_tag_counts`) for aggregation, or a simple distinct query grouped by category with counts.

