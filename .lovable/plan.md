

## Add Tag Matching to eBay Sync Rules

Currently sync rules can filter by category, brand, price, and graded-only. You want to also match on **Shopify/normalized tags** (e.g., "graded", "comics", "psa", "professional") so you can build rules like "anything tagged graded + comics + psa".

### Changes

**1. Database: Add `tag_match` column to `ebay_sync_rules`**
- Add `tag_match text[] DEFAULT '{}'` — works the same as `brand_match` and `category_match`
- No migration needed beyond an ALTER TABLE

**2. UI: `src/components/admin/EbaySyncRulesEditor.tsx`**
- Add a "Tag Matches" input section (same pattern as Brand Matches — text input + Add button + removable badges)
- Add `tag_match` to the `SyncRule` interface and `DEFAULT_RULE`
- Include `tag_match` in save/create mutation payloads
- Show tag badges in the rules table Filters column

**3. Backend: `supabase/functions/ebay-apply-sync-rules/index.ts`**
- Add `tag_match: string[]` to the `SyncRule` interface
- Add `normalized_tags` to the intake_items SELECT query
- Add tag matching logic in `matchesRule()`: if `rule.tag_match` has entries, check that **all** specified tags exist in the item's `normalized_tags` array (AND logic — item must have all specified tags to match)

### Tag Matching Logic

For a rule with tags `["graded", "comics", "psa"]`, an item matches only if its `normalized_tags` contains **all three**. This lets you create precise rules like "PSA graded comics" without catching ungraded comics or PSA cards that aren't comics.

