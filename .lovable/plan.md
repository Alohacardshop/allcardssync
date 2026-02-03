
# Fix: Variety Information Missing for Duplicate Items in Graded Comic Intake

## Problem Summary
When adding a PSA-graded comic that has a duplicate SKU (same certificate number already exists in the batch), the variety information (e.g., "1 1:25 Matteo Scalera Variant Cover") is not being saved to the title and variant fields.

## Root Cause
The `useAddIntakeItem` hook has duplicate detection logic that checks if an item with the same SKU already exists. When a duplicate is found, it only updates:
- `quantity` (incremented)
- `lot_id` (moved to current batch)
- `removed_from_batch_at` (cleared)
- `updated_at` (timestamp)

It does **NOT** update the descriptive fields like `subject`, `variant`, or `catalog_snapshot`. This means if the original record was created before the variety feature was implemented (or had incomplete data), the new enriched data is discarded.

## Technical Details
The database shows:
- Certificate #125580263 was first created on Feb 2nd with `subject: "Absolute Superman"` and `variant: "PSA 9.6"` (no variety)
- The item has been re-added 3 times (quantity: 3)
- The `catalog_snapshot` correctly contains `varietyPedigree: "1 1:25 Matteo Scalera Variant Cover"` from the most recent PSA lookup
- But `subject` and `variant` were never updated during subsequent additions

## Solution
Modify the duplicate handling logic in `useAddIntakeItem.ts` to update the descriptive fields when re-adding an item, ensuring the latest data from the grading service lookup is preserved.

### Files to Modify

#### 1. `src/hooks/useAddIntakeItem.ts`
Update the duplicate handling logic in two places (lines ~94-102 and ~180-188) to include additional fields when updating existing items.

**Current Update (line ~94-102):**
```typescript
const { error: updateError } = await supabase
  .from('intake_items')
  .update({ 
    quantity: newQuantity,
    lot_id: activeLotId,
    removed_from_batch_at: null,
    updated_at: new Date().toISOString()
  })
  .eq('id', existing.id);
```

**New Update:**
```typescript
const { error: updateError } = await supabase
  .from('intake_items')
  .update({ 
    quantity: newQuantity,
    lot_id: activeLotId,
    removed_from_batch_at: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    // Update descriptive fields with new data
    subject: params.subject_in || existing.subject,
    variant: params.variant_in || existing.variant,
    catalog_snapshot: params.catalog_snapshot_in || existing.catalog_snapshot,
    brand_title: params.brand_title_in || existing.brand_title,
    year: params.year_in || existing.year,
    grade: params.grade_in || existing.grade,
  })
  .eq('id', existing.id);
```

The same change needs to be applied to the second duplicate handling block (race condition fallback around line ~180-188).

### Testing Required
After implementation:
1. Search for a PSA comic with variety information (e.g., certificate 125580263)
2. Confirm variety is displayed in the PSA certificate preview
3. Add to batch - verify title shows variety (e.g., "Absolute Superman 1 1:25 Matteo Scalera Variant Cover PSA 9.6")
4. Try adding the same certificate again - verify quantity increases AND title/variant remain correct with variety
5. Check that the batch panel displays the complete title with variety
