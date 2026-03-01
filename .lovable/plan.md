

## Add Tag-to-Category Mapping Settings to eBay Admin

### Current State
The tag-to-category mapping is hardcoded in two places:
1. **Database trigger** (`trigger_normalize_tags`) — maps tags like `pokemon` → `primary_category: 'pokemon'`, `comics` → `'comics'`, etc.
2. **Edge function** (`ebayConditions.ts`) — maps `primary_category` values to eBay category IDs (`tcg` → `183454`, `comics` → `259061`, etc.)

Both require code/SQL changes to modify. You want these editable from the UI.

### Plan

**1. Create a `tag_category_mappings` table**
- Columns: `id`, `tag_value` (text), `primary_category` (text), `condition_type` (text, nullable), `ebay_category_id` (text, nullable), `is_active` (boolean), `created_at`, `updated_at`
- Seed with current hardcoded mappings: `pokemon` → `pokemon`, `comics` → `comics`, `sports` → `sports`, `tcg` → `tcg`, `graded` → condition `graded`, `sealed` → condition `sealed`
- RLS: admin-only write, authenticated read

**2. Update the DB trigger to read from the table**
- Replace the hardcoded IF/ELSIF chain in `trigger_normalize_tags` with a lookup against `tag_category_mappings`
- Falls back to `main_category` if no match found

**3. Update `ebayTemplateResolver.ts` and `ebayConditions.ts`**
- Add a `getEbayCategoryIdDB()` call that checks `tag_category_mappings.ebay_category_id` before falling back to the hardcoded switch
- This lets you override eBay category per tag from the admin UI

**4. Add "Tag Mappings" tab to the eBay admin page (`EbayApp.tsx`)**
- New tab alongside Settings, Policies, Templates, Categories, etc.
- Shows a table of all tag → category mappings with columns: Tag, Primary Category, Condition Type, eBay Category, Active
- Inline editing for each row
- "Add Mapping" button for new tags
- Delete button per row
- Uses the existing auto-save pattern from the eBay settings page

### Files to create/modify
- **New migration**: Create `tag_category_mappings` table + update `trigger_normalize_tags` function
- **New component**: `src/components/admin/EbayTagCategoryMappings.tsx` — the settings UI
- **Edit**: `src/pages/EbayApp.tsx` — add new tab
- **Edit**: `supabase/functions/_shared/ebayTemplateResolver.ts` — DB lookup for category-to-eBay-ID override
- **Deploy**: `ebay-sync-processor` after template resolver changes

