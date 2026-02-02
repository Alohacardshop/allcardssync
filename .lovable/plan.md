

## Graded Comic Intake - Fix Missing Data Issues

I've identified several issues causing **variant**, **year**, and **category** not to be saved correctly for graded comics.

---

### Issues Found

#### 1. Invalid `year_in` Parameter
The frontend is sending `year_in` but the database function **does not accept this parameter**. The current RPC function signature is:
```
store_key_in, shopify_location_gid_in, quantity_in, brand_title_in, subject_in, 
category_in, variant_in, card_number_in, grade_in, price_in, cost_in, sku_in, 
source_provider_in, catalog_snapshot_in, pricing_snapshot_in, processing_notes_in, 
main_category_in, sub_category_in
```
There is no `year_in` - the year should only be stored inside `catalog_snapshot_in`.

#### 2. Missing `sub_category_in` for Comics
`GradedCardIntake` sends `sub_category_in` but `GradedComicIntake` doesn't include it.

#### 3. Grading Company Defaults to "PSA"
The database column `grading_company` defaults to `'PSA'`, and the RPC function doesn't accept a parameter to override it. All database records show `grading_company: 'PSA'` even for CGC comics.

#### 4. Variant is Working
Variant is correctly being set to `${gradingService.toUpperCase()} ${formData.grade}` (e.g., "CGC 9.8"). Database confirms this is saving correctly.

---

### Proposed Fixes

#### Fix 1: Remove Invalid `year_in` Parameter
Remove `year_in` from the `addItem()` call in `GradedComicIntake.tsx` - it's not supported by the database function. Year data is already correctly stored in `catalog_snapshot_in`.

#### Fix 2: Remove `year_in` from Hook Interface
Remove `year_in` from `useAddIntakeItem.ts` interface since the database doesn't support it.

#### Fix 3: Add `sub_category_in` to Comic Intake
Add sub-category support to comic intake for consistency with card intake.

#### Fix 4: Update Database Function to Accept `year_in`
Create a migration to update `create_raw_intake_item` to accept `year_in` and properly insert it into the `year` column of `intake_items`.

---

### Technical Implementation Details

**File: `src/components/GradedComicIntake.tsx`**
- Remove line 278: `year_in: formData.year || null,`
- Add: `sub_category_in: 'graded_comics',` for proper categorization

**File: `src/hooks/useAddIntakeItem.ts`**
- Remove line 23: `year_in?: string | null;` from interface

**File: `supabase/migrations/[new]_add_year_to_intake_rpc.sql`**
Create a new migration to update the RPC function to:
1. Accept `year_in text DEFAULT NULL` as a new parameter
2. Insert `year_in` value into the `year` column

---

### Why Year Isn't Saving

The database **does** have a `year` column, but the RPC function never writes to it. The function would need to be updated to:
1. Accept `year_in` as a parameter
2. Include `year` in the INSERT column list
3. Use `year_in` as the value

---

### Database Migration Required

```sql
-- Update create_raw_intake_item to support year_in parameter
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer DEFAULT 1,
  brand_title_in text DEFAULT '',
  subject_in text DEFAULT '',
  category_in text DEFAULT '',
  variant_in text DEFAULT '',
  card_number_in text DEFAULT '',
  grade_in text DEFAULT '',
  price_in numeric DEFAULT 0,
  cost_in numeric DEFAULT NULL,
  sku_in text DEFAULT '',
  source_provider_in text DEFAULT 'manual',
  catalog_snapshot_in jsonb DEFAULT NULL,
  pricing_snapshot_in jsonb DEFAULT NULL,
  processing_notes_in text DEFAULT NULL,
  main_category_in text DEFAULT NULL,
  sub_category_in text DEFAULT NULL,
  year_in text DEFAULT NULL  -- NEW PARAMETER
)
...
-- Then add year to INSERT statement:
INSERT INTO public.intake_items (
  ...,
  year,  -- Add this column
  ...
)
VALUES (
  ...,
  year_in,  -- Add this value
  ...
)
```

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/GradedComicIntake.tsx` | Remove `year_in`, add `sub_category_in` |
| `src/hooks/useAddIntakeItem.ts` | Keep `year_in` in interface for future use |
| `supabase/migrations/[new].sql` | Update RPC to accept and insert `year_in` |

---

### Summary

The main blocker is that the **database RPC function doesn't support `year_in`**. The frontend changes are quick, but properly persisting year data requires a database migration to update the function signature.

