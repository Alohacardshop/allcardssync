

## Fix: Parameter Mismatch in Graded Comic Intake

### Problem Identified
When adding a graded comic to the batch, the system sends a parameter called `grading_company_in` to the database function `create_raw_intake_item`, but this parameter **does not exist** in the database function.

**Database function expects:**
`brand_title_in, card_number_in, catalog_snapshot_in, category_in, cost_in, grade_in, main_category_in, price_in, pricing_snapshot_in, processing_notes_in, quantity_in, shopify_location_gid_in, sku_in, source_provider_in, store_key_in, sub_category_in, subject_in, variant_in`

**Frontend is sending (incorrectly):**
`brand_title_in, card_number_in, catalog_snapshot_in, category_in, cost_in, grade_in, grading_company_in, main_category_in, price_in, quantity_in, shopify_location_gid_in, sku_in, store_key_in, subject_in, variant_in`

### Solution

1. **Remove `grading_company_in` from the RPC call** - The grading company info is already being stored inside the `catalog_snapshot_in` JSON field (as `grading_company: 'PSA'` or `grading_company: 'CGC'`), so we don't need a separate parameter.

2. **Update `GradedComicIntake.tsx`** - Remove the `grading_company_in` parameter from the `addItem()` call.

3. **Update `useAddIntakeItem.ts`** - Remove `grading_company_in` from the `AddIntakeItemParams` interface since the database function doesn't support it.

4. **Also remove `PurchaseLocationSelect` import** - This component import still exists in `GradedComicIntake.tsx` but shouldn't be there based on your earlier request.

---

### Technical Details

**File: `src/components/GradedComicIntake.tsx`**
- Line 20: Remove the `PurchaseLocationSelect` import
- Line 53: Remove `purchaseLocationId` from form state
- Lines 102-103: Remove `purchaseLocationId` from reset state
- Lines 261-277: Remove `grading_company_in` parameter from `addItem()` call
- Lines 279-296: Remove purchase location update logic
- Lines 314-315: Remove `purchaseLocationId` from form reset

**File: `src/hooks/useAddIntakeItem.ts`**
- Line 18: Remove `grading_company_in` from the interface

After these changes, the RPC call parameters will match the database function signature and the add-to-batch operation will succeed.

