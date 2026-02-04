
# Fix Tag-Based System: Missing Field + UI Consolidation

## Summary

The tag-based inventory system with auto-sync to Shopify is mostly implemented, but there's a critical missing field and the UI can be consolidated to fix overlapping issues.

---

## Issues Found

### Issue 1: Missing `normalized_tags` in Query
The `useInventoryListQuery.ts` SELECT statement doesn't include `normalized_tags`. This means:
- The TagEditor always receives empty `normalizedTags` array
- Users can't see the normalized version of their tags in the editor

### Issue 2: Two Separate Filter Cards Create Visual Clutter
Currently the layout has:
1. A Card for `QuickFilterPresets`
2. A separate Card for `Search + Filters + Bulk Actions`

This creates visual overlap and wastes vertical space.

---

## Implementation Plan

### Fix 1: Add `normalized_tags` to Query

**File:** `src/hooks/useInventoryListQuery.ts`

Add `normalized_tags` to the SELECT statement (around line 105):

```typescript
vendor,
year,
category,
variant,
shopify_tags,
normalized_tags  // ADD THIS LINE
```

### Fix 2: Consolidate Filter UI into Single Card

**File:** `src/pages/Inventory.tsx`

Merge QuickFilterPresets into the main filter Card for a cleaner layout:

```text
Layout Before:
┌────────────────────────────────┐
│ Card 1: QuickFilterPresets     │
└────────────────────────────────┘
┌────────────────────────────────┐
│ Card 2: Search + Filters       │
│          Bulk Actions          │
│          Item Count            │
└────────────────────────────────┘

Layout After:
┌────────────────────────────────┐
│ Quick Filters (scrollable)     │
│ ────────────────────────────── │
│ Search + Status + Location     │
│ ────────────────────────────── │
│ Bulk Actions (if selected)     │
│ ────────────────────────────── │
│ Item Count                     │
└────────────────────────────────┘
```

**Changes:**
- Remove the first `<Card>` wrapping `QuickFilterPresets`
- Move `QuickFilterPresets` inside the main filter Card
- Add horizontal overflow scrolling for presets on mobile
- Use subtle dividers (`border-b` or `pb-x`) between sections

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useInventoryListQuery.ts` | Add `normalized_tags` to SELECT |
| `src/pages/Inventory.tsx` | Merge QuickFilterPresets into main filter Card |

---

## Technical Details

### Query Change (useInventoryListQuery.ts)

```typescript
// Line ~105 - add normalized_tags after shopify_tags
          variant,
          shopify_tags,
          normalized_tags
```

### UI Consolidation (Inventory.tsx)

Replace the two-card structure (lines ~1322-1459) with:

```tsx
<Card>
  <CardContent className="py-4 space-y-4">
    {/* Quick Filter Presets - horizontal scrollable */}
    <div className="overflow-x-auto pb-2">
      <QuickFilterPresets
        onApplyPreset={handleApplyQuickFilter}
        onClearFilters={handleClearAllFilters}
        activePreset={activeQuickFilter}
      />
    </div>
    
    <div className="border-t pt-4">
      {/* Search + Filters Row */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        {/* Search input */}
        {/* Status, Location, More Filters dropdowns */}
      </div>
    </div>

    {/* Bulk Actions - only when items selected */}
    {selectedItems.size > 0 && (
      <div className="border-t pt-4">
        <BulkActionsToolbar ... />
      </div>
    )}

    {/* Item count footer */}
    <div className="border-t pt-2 ...">
      Showing X of Y items
    </div>
  </CardContent>
</Card>
```

---

## Current Auto-Sync Behavior (Already Working)

The tag auto-sync to Shopify is already implemented:

1. **User edits tags in TagEditor**
2. **Save to local DB** → `intake_items.shopify_tags` updated
3. **DB trigger fires** → `normalized_tags` auto-populated
4. **If Shopify synced** → Edge function called with `action: 'replace'`
5. **Shopify updated** → Product tags replaced with new list
6. **UI feedback** → "Tags synced to Shopify" toast shown

---

## Expected Outcome

After these fixes:
- TagEditor will show normalized tags (lowercase, deduplicated)
- Single consolidated Card for all filters - no overlap
- Better mobile experience with horizontal scroll for presets
- Cleaner visual hierarchy with subtle dividers
