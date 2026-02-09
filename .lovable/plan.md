

# Full Review: eBay Mapping, Policy, and Category System

## System Architecture Overview

The eBay integration has a layered configuration system that determines how inventory items become eBay listings. There are **5 key tables** and **3 resolution layers** involved.

---

## 1. The Five Configuration Tables

### ebay_store_config (Store-Level Defaults)
The top-level configuration. Contains global fallback settings for a store:
- **default_category_id** -- fallback eBay category if no template/mapping matches
- **default_fulfillment_policy_id**, **default_payment_policy_id**, **default_return_policy_id** -- fallback business policies
- **title_template**, **description_template** -- fallback title/description formatting
- **price_markup_percent** -- percentage added to item price
- **environment** -- sandbox vs production
- **sync_enabled**, **dry_run_mode** -- production safety toggles

### ebay_listing_templates (Template-Level Configuration)
Templates define how a specific *type* of item should be listed. Each template contains:
- **category_id** -- the eBay category for this type of listing
- **condition_id** -- graded (2750), ungraded (4000), or like new (3000)
- **is_graded** -- whether this template is for graded items
- **title_template**, **description_template** -- formatting with variables like `{subject}`, `{brand_title}`, `{grade}`
- **default_grader** -- PSA, BGS, CGC, etc.
- **fulfillment_policy_id**, **payment_policy_id**, **return_policy_id** -- template-specific policy overrides
- **aspects_mapping** -- custom item aspects (currently unused in favor of auto-built aspects)

### ebay_category_mappings (Routing Rules)
Maps items to templates based on their characteristics:
- **brand_match** (array) -- brand name keywords (e.g., "Pokemon", "Topps")
- **keyword_pattern** -- regex pattern for matching
- **main_category** -- item type match (tcg, sports, comics)
- **default_template_id** -- links to a specific listing template
- **priority** -- higher priority rules are evaluated first

### ebay_categories (Category Registry)
The managed list of eBay categories available in dropdowns:
- **id** -- the actual eBay category ID (e.g., "183454")
- **name** -- display name
- **item_type** -- tcg, sports, comics, other
- **is_active** -- controls visibility in dropdowns
- Can be imported live from eBay's Taxonomy API via `ebay-fetch-categories`

### ebay_sync_rules (Auto-Queue Rules)
Determines which items should be automatically flagged for eBay listing:
- **rule_type** -- include or exclude
- **category_match**, **brand_match** -- matching criteria
- **min_price**, **max_price** -- price range filters
- **graded_only** -- only graded items
- **auto_queue** -- automatically add to sync queue
- **priority** -- first matching rule wins

---

## 2. The Resolution Flow (How an Item Gets Its Settings)

When an item is listed on eBay (via `ebay-create-listing` or `ebay-sync-processor`), the system resolves configuration in this priority order:

```text
Step 1: TEMPLATE RESOLUTION
  +-----------------------------+
  | Category Mappings           |  <-- Highest priority
  | (brand_match, keyword,      |
  |  main_category)             |
  +-----------------------------+
              |
              v (no match?)
  +-----------------------------+
  | Templates by graded status  |  <-- Fallback
  | + category ID match         |
  +-----------------------------+
              |
              v (no match?)
  +-----------------------------+
  | First template (is_default) |  <-- Last resort
  +-----------------------------+

Step 2: SETTING RESOLUTION (per field)
  Template value > Store Config value > Hardcoded default

  Category:  template.category_id  >  auto-detect from brand  >  '183454' (CCG)
  Policies:  template.*_policy_id  >  storeConfig.default_*_policy_id  >  ''
  Title:     template.title_template  >  storeConfig.title_template  >  auto-build
  Condition: template.condition_id  >  graded='2750' / ungraded='4000'
```

---

## 3. Issues Found

### ISSUE 1: Hardcoded Category Fallbacks Still in Edge Functions (MEDIUM)
Both `ebay-create-listing` and `ebay-sync-processor` still contain hardcoded category ID comparisons in their template-matching fallback logic:

```typescript
// In resolveTemplate() -- lines 408-413 of ebay-sync-processor
templates.find(t => {
  if (detectedCategory === 'tcg' && t.category_id === '183454') return true
  if (detectedCategory === 'sports' && t.category_id === '261328') return true
  if (detectedCategory === 'comics' && (t.category_id === '63' || t.category_id === '259061')) return true
  return false
})
```

This means if an admin changes the category ID for TCG cards in the `ebay_categories` table to a different ID, this fallback won't find the right template. It should instead look up the `ebay_categories` table by `item_type` to find the correct category.

**Same issue in `ebay-create-listing`** (lines 147-155).

### ISSUE 2: `detectCategoryFromBrand()` Uses Hardcoded Brand Lists (MEDIUM)
The `ebayConditions.ts` shared module has hardcoded `CATEGORY_BRAND_PATTERNS` arrays (lines 170-188). These are not synced with the database categories or mappings. If an admin adds new brands to their category mappings, they won't be picked up by the auto-detection logic used as a fallback.

The `ebay_category_mappings` table already stores brand matches -- the detection function should query those rather than relying on hardcoded patterns.

### ISSUE 3: Category Mappings Have No UI for Editing (MEDIUM)
The `ebay_category_mappings` table is displayed read-only in `EbayTemplateManager.tsx` (lines 339-365). There is no way for admins to create, edit, or delete category mappings from the UI. These can only be managed through direct database access.

This means admins cannot:
- Add new brand-to-category routing rules
- Link a mapping to a specific template
- Change priority ordering
- Deactivate a mapping

### ISSUE 4: Template `category_name` Is Set Wrong (LOW)
In `EbayTemplateManager.tsx` line 122, when saving a template:
```typescript
category_name: editingTemplate.category_id || null,  // BUG: saves category_id as the name
```
It should be saving the actual category name, not the ID. This means the category name displayed on template cards is wrong (showing the ID instead).

### ISSUE 5: Sync Rules Category Options Are Hardcoded (LOW)
`EbaySyncRulesEditor.tsx` (lines 68-79) has a hardcoded `CATEGORY_OPTIONS` array. This should ideally pull from the `ebay_categories` table to stay in sync with the admin's managed categories.

### ISSUE 6: `ebay-create-listing` Duplicates Template Resolution Logic (LOW)
The template resolution logic exists in both `ebay-create-listing` (lines 110-160) and `ebay-sync-processor` (lines 345-417). They are largely identical but maintained separately, creating a risk of drift. The `resolveTemplate` function in `ebay-sync-processor` is more cleanly factored; the same approach should be used in `ebay-create-listing`.

### ISSUE 7: `buildTradingCardAspects()` Is Always Used Regardless of Category (LOW)
Both edge functions always call `buildTradingCardAspects(item)` regardless of whether the item is a trading card, sports card, or comic. The `ebayConditions.ts` file has dedicated `buildSportsCardAspects()` and `buildComicAspects()` functions (lines 364-473), but they are never called. This means sports cards get aspects like "Character" and "Card Name" instead of "Player/Athlete", and comics get card aspects instead of "Publisher" and "Issue Number".

---

## 4. Proposed Fixes

### Fix 1: Build Category Mapping Editor UI
Create a full CRUD interface for `ebay_category_mappings` within the Templates tab, allowing admins to:
- Create new mapping rules with brand matches, keyword patterns, and category selections
- Link mappings to specific listing templates
- Set priorities and toggle active/inactive
- Use the `EbayCategorySelect` component for the category field

### Fix 2: Replace Hardcoded Category Fallbacks with DB Lookup
Update the `resolveTemplate()` function in both edge functions to query `ebay_categories` by `item_type` instead of comparing against hardcoded IDs. This makes the system fully dynamic.

### Fix 3: Fix Template `category_name` Save Bug
Change `EbayTemplateManager.tsx` line 122 to look up the actual category name from the selected category, or pass it through from the `EbayCategorySelect` component.

### Fix 4: Use Category-Aware Aspect Builders
Update both edge functions to select the correct aspect builder (`buildTradingCardAspects`, `buildSportsCardAspects`, or `buildComicAspects`) based on the detected category or template `item_type`.

### Fix 5: Deduplicate Template Resolution
Extract the template resolution logic from `ebay-create-listing` into the shared `resolveTemplate` function already in `ebay-sync-processor`, or better yet, move it to `_shared/ebayApi.ts` so both functions import the same logic.

### Fix 6: Sync Rules Category Options from DB
Update `EbaySyncRulesEditor` to fetch category options from `ebay_categories` instead of using a hardcoded array.

---

## Technical Details

### Files to Create
- None (all changes are to existing files)

### Files to Modify

**Frontend:**
- `src/components/admin/EbayTemplateManager.tsx` -- Add category mapping CRUD UI; fix `category_name` bug on line 122
- `src/components/admin/EbaySyncRulesEditor.tsx` -- Replace hardcoded `CATEGORY_OPTIONS` with DB query
- `src/components/admin/EbayCategorySelect.tsx` -- Optionally expose selected category name via callback for the `category_name` fix

**Edge Functions:**
- `supabase/functions/_shared/ebayConditions.ts` -- Update `detectCategoryFromBrand()` to accept a fallback and update `getEbayCategoryId()` to optionally query the DB; export a helper to choose the right aspect builder
- `supabase/functions/ebay-create-listing/index.ts` -- Use shared `resolveTemplate()`; use category-aware aspect builder; remove duplicated template resolution
- `supabase/functions/ebay-sync-processor/index.ts` -- Use category-aware aspect builder; replace hardcoded category ID checks in `resolveTemplate()` with DB lookup

### Implementation Order
1. Fix the `category_name` bug (quick win, no dependencies)
2. Add category mapping editor UI (most impactful for admin usability)
3. Fix aspect builder selection (correctness for sports/comics listings)
4. Replace hardcoded category fallbacks with DB lookups (makes system fully dynamic)
5. Deduplicate template resolution logic (maintainability)
6. Sync rules category options from DB (minor improvement)

