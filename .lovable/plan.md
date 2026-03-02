

## Template-Driven Condition + Aspect Resolution

### Problem
Currently, each template stores a single `condition_id` (text). If that ID is invalid for the category, `resolveConditionId` falls back to a hardcoded guess (`3000` or `4000`). The user wants templates to drive a **priority list** of preferred conditions, and grading data should only appear in aspects if the taxonomy supports those keys — otherwise it falls back to description text.

### Changes

#### 1. DB Migration: Add `preferred_condition_ids` column to `ebay_listing_templates`

Add a `jsonb` column `preferred_condition_ids` (text array, e.g. `["2750", "3000", "4000"]`) alongside the existing `condition_id`. The processor will iterate this list and pick the first valid one. `condition_id` remains as a simple fallback if `preferred_condition_ids` is null.

```sql
ALTER TABLE ebay_listing_templates 
  ADD COLUMN preferred_condition_ids jsonb DEFAULT NULL;

COMMENT ON COLUMN ebay_listing_templates.preferred_condition_ids IS 
  'Ordered priority list of condition IDs. Processor picks the first valid one for the category.';
```

#### 2. Update `resolveConditionId` in `ebayCategorySchema.ts`

Change signature to accept `preferredIds: string[]` (a list) instead of a single string. Iterate the list and return the first match found in the schema's valid condition IDs. If none match, fall back to the first valid ID from the schema.

#### 3. Update `processCreate` and `processUpdate` in `ebay-sync-processor`

- Build the preferred list: `template.preferred_condition_ids || [template.condition_id] || [isGraded ? '2750' : '4000']`
- Pass the list to `resolveConditionId`
- After `validateAspects`, check if grading aspect keys (`Professional Grader`, `Grade`, `Certification Number`) were **removed** by the filter. If they were, append grading info to the description text instead (e.g. `"PSA 10 — Cert #146094215"`).

#### 4. Update template editor UI to support `preferred_condition_ids`

In the template form, replace the single condition ID input with a multi-value input where the user can add condition IDs in priority order. The existing `condition_id` field stays as a readonly fallback display.

### Files Modified
- **DB migration** — add `preferred_condition_ids` column
- `supabase/functions/_shared/ebayCategorySchema.ts` — update `resolveConditionId` to accept a list
- `supabase/functions/ebay-sync-processor/index.ts` — build preferred list from template, grading-to-description fallback
- Template editor component (wherever the template form lives) — multi-value condition ID input

