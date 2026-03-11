

## Bulk Graded Comic Import

Not hard at all. The existing `PSABulkImport` component already implements this exact pattern for graded cards (CSV of cert numbers → lookup each → batch add). We can adapt it for graded comics.

### Approach

Create a new `GradedComicBulkImport` component, modeled on `PSABulkImport`, with these features:

1. **Two input methods**: CSV file upload and manual textarea (paste cert numbers, one per line)
2. **Grading service selector**: PSA or CGC toggle (reuses existing `psa-lookup` and `cgc-lookup` edge functions)
3. **Sequential processing**: For each cert number, call the appropriate lookup function, auto-populate title/publisher/grade/year from the response
4. **Price/cost fields**: Global default price or per-item override after lookup
5. **Progress bar + status table**: Shows pending/processing/success/error per item (same UX as PSABulkImport)
6. **Batch submission**: Adds all successful items to intake via `useAddIntakeItem` with `main_category: 'comics'`, `sub_category: 'graded_comics'`

### Files to create/modify

- **New**: `src/components/GradedComicBulkImport.tsx` — bulk import component (adapted from PSABulkImport, ~300 lines)
- **Modify**: `src/components/GradedComicIntake.tsx` — add a tab or collapsible section to switch between single entry and bulk import
- **Modify**: `src/pages/Index.tsx` — no changes needed (GradedComicIntake already rendered under Comics → Graded)

### Key differences from PSABulkImport

- Supports both PSA and CGC lookups (not just PSA)
- Maps response fields to comic-specific data (title, issue number, publisher, publication date) instead of card fields
- Sets `main_category_in: 'comics'`, `sub_category_in: 'graded_comics'`, `grading_company_in` per item
- Uses the same catalog snapshot structure as the existing single-item `GradedComicIntake`

