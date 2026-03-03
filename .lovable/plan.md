

## Add Default Intake Tags: card, graded, comics, raw

### Current State
The `trigger_normalize_tags` function on `intake_items` already auto-generates tags from metadata. It currently adds:
- "graded" when `grading_company` is present
- `main_category` value (e.g., "tcg", "comics")
- brand, year, grade tags

**Missing:** explicit "card", "raw", and "comics" tags based on item type/category.

### Changes

**Update `trigger_normalize_tags` function** to add these tags during auto-generation (lines 19-57 of the tag generation block):

1. **"card" tag** -- added when `main_category` is `'tcg'` or `'sports'` (i.e., any card-based category, not comics)
2. **"graded" tag** -- already present, no change needed
3. **"comics" tag** -- added when `main_category = 'comics'` (already happens via the `main_category` line, but we'll ensure it's explicit)
4. **"raw" tag** -- added when `grading_company` is NULL or `'none'` (ungraded items)

The logic is inserted into the existing tag generation `IF NEW.shopify_tags IS NULL` block:

```sql
-- Add "card" tag for card-based categories
IF NEW.main_category IN ('tcg', 'sports') THEN
  v_generated_tags := v_generated_tags || ARRAY['card'];
END IF;

-- Add "raw" tag for non-graded items
IF NEW.grading_company IS NULL OR NEW.grading_company = 'none' OR NEW.grading_company = '' THEN
  v_generated_tags := v_generated_tags || ARRAY['raw'];
END IF;
```

**Backfill existing items** -- touch rows with `shopify_tags IS NULL` so the trigger re-fires, and also reset `shopify_tags` to NULL for existing items so they get regenerated with the new tags.

This is a single SQL migration updating the trigger function and backfilling.

