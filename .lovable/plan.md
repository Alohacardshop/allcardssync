

## Audit Results — Issues Found

### Problem 1: `grading_company` column never set correctly
The `create_raw_intake_item` RPC function has no `grading_company_in` parameter. The column defaults to `'PSA'` for ALL items — including CGC comics and CGC cards. Both intake components only store the grading company inside `catalog_snapshot`, not in the actual column. This means the Edit Item Details dialog cannot detect CGC items correctly (it checks `grading_company` column).

### Problem 2: `image_urls` never stored during intake
Neither `GradedComicIntake` nor `GradedCardIntake` passes image URLs (from PSA/CGC lookups) into the item record. The `create_raw_intake_item` RPC extracts them from `catalog_snapshot` internally, but only if the snapshot keys match `imageUrls` or `images`. The PSA normalized data uses `imageUrls` (should work), but CGC data uses `images.front`/`images.rear` (won't be extracted).

### Problem 3: GradedCardIntake variant not mapped for non-comic PSA cards
Line 292 has `isComic` guard — PSA card `varietyPedigree` (e.g., "Reverse Holo") is stored in `formData.varietyPedigree` but never mapped to `variant_in` for card items.

### Problem 4: Inconsistent grading service key in catalog_snapshot
- GradedComicIntake stores `grading_company: 'PSA'|'CGC'`
- GradedCardIntake stores `grading_service: 'psa'|'cgc'` (different key AND case)

---

## Plan

### 1. Update `create_raw_intake_item` RPC — add `grading_company_in` parameter
New migration that adds `grading_company_in text DEFAULT 'PSA'` to the function signature, and inserts it into the `grading_company` column. This is the root fix.

### 2. Fix `GradedCardIntake.tsx`
- Pass `grading_company` to catalog_snapshot using consistent key (`grading_company` not `grading_service`)
- Map `varietyPedigree` to `variant_in` for ALL items (remove the `isComic` guard)
- After `addItem` call, update `grading_company` column directly (same pattern as vendor update) until RPC is updated

### 3. Fix `GradedComicIntake.tsx`
- After `addItem` call, update `grading_company` column directly based on `gradingService`
- Store image URLs: after insert, update `image_urls` column with PSA's `imageUrls` or CGC's `images.front`/`images.rear`

### 4. Fix `CurrentBatchPanel.tsx` edit dialog data mapping
- When building the `gradingCompany` prop, also check `catalog_snapshot.grading_company` and `catalog_snapshot.grading_service` as fallbacks (handles items created before the fix)

### Technical Detail
The `grading_company` column already exists with `NOT NULL DEFAULT 'PSA'`. Adding the parameter to the RPC requires a new migration that drops and recreates the function with the added parameter. Both intake components will also do a post-insert UPDATE as a belt-and-suspenders approach until the RPC migration is live. The `useAddIntakeItem` hook's `AddIntakeItemParams` interface needs no change since it calls `supabase.rpc()` with `params as any`.

