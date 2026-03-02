

## Problem

`GradedComicIntake.tsx` is the component used for comic intake (not `GradedCardIntake.tsx`). It has two issues:

1. **No normalization**: Line 154 uses raw PSA API data directly (`data.data`) without calling `normalizePSAData`, so `grade` stays "10.0"
2. **Variant construction** (lines 264-270): It builds `variant` by concatenating `varietyPedigree + grading company + grade` (e.g., `"1 PSA 10.0"`), and also bakes this into `subject_in` as `titleWithVariant`. The variant should just be the `varietyPedigree` value ("1"), and grade info should NOT be appended to subject or variant since it's already stored in separate `grade_in` and `grading_company` fields.

## Changes

**File: `src/components/GradedComicIntake.tsx`**

1. **Import and apply normalization** (line 154-166): Import `normalizePSAData` and run it on `data.data` before setting `psaData` and form fields. This ensures `grade` becomes "10" (stripped `.0`).

2. **Fix variant construction** (lines 264-280): 
   - Set `variant_in` to just `varietyPedigree` (e.g., "1") — no grade info appended
   - Set `subject_in` to just `formData.title` (e.g., "Amazing Spider-Man") — no variant/grade info appended
   - The grade is already stored via `grade_in` and displayed separately in batch panel

### Result
- `variant`: "1" (just the PSA variety/pedigree)
- `grade`: "10" (cleaned)
- `subject`: "Amazing Spider-Man" (clean title only)

