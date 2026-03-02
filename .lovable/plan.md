

## Problem

Three code paths allow graded item quantity to exceed 1:

1. **`useAddIntakeItem.ts` (two identical blocks, lines ~129 and ~253)** — When a graded item exists in a closed/removed lot and gets re-added, the code calculates `newQuantity = existing.quantity + params.quantity_in`. For graded items this should always be forced to 1.

2. **`InlineQuantityEditor.tsx`** — The inline quantity editor in the inventory UI has no concept of "graded." Staff can manually type any number and save it. For graded items, the editor should be locked to 1 (read-only).

3. **Database safety net** — A trigger on `intake_items` should enforce quantity = 1 for any row where `grading_company` is set, as a last line of defense regardless of which code path writes.

## Plan

### 1. Fix `useAddIntakeItem.ts` — force quantity to 1 for graded re-adds

In both the primary path (~line 129) and the race-condition retry path (~line 253), wrap the quantity calculation:

```typescript
const isGraded = !!(params.grading_company_in || existing.grading_company);
const newQuantity = isGraded ? 1 : (existing.quantity || 0) + (params.quantity_in || 1);
```

### 2. Lock `InlineQuantityEditor` for graded items

- Add `isGraded?: boolean` prop to `InlineQuantityEditorProps`
- When `isGraded` is true, render the read-only locked state with reason "Graded items are always 1-of-1"
- Update all 4 call sites to pass `isGraded` based on `grading_company` field presence

### 3. Add database trigger as safety net

Create a trigger `enforce_graded_quantity_one` on `intake_items` that fires `BEFORE INSERT OR UPDATE` and sets `NEW.quantity = 1` whenever `NEW.grading_company IS NOT NULL AND NEW.grading_company != 'none'`. This catches any edge case regardless of code path.

### Technical Details

**Files to modify:**
- `src/hooks/useAddIntakeItem.ts` — two quantity calculation lines
- `src/components/inventory-card/InlineQuantityEditor.tsx` — add `isGraded` prop
- `src/features/inventory/components/InventoryTableView.tsx` — pass `isGraded`
- `src/features/inventory/components/inspector/tabs/OverviewTab.tsx` — pass `isGraded`
- `src/components/inventory-card/InventoryItemMetaRow.tsx` — pass `isGraded`
- `src/components/ShopifySyncDetailsDialog.tsx` — pass `isGraded`
- New migration: trigger `enforce_graded_quantity_one`

