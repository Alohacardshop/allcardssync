

## Use Tags as Primary Driver for eBay Category Selection

**The Problem:**
Right now, eBay category selection works like this:
1. Try to match `brand_title` against DB brand mappings
2. Try hardcoded brand patterns (e.g., "Pokemon" → tcg, "Marvel" → comics)
3. Fall back to `main_category` field

This is fragile — if a comic doesn't have a recognizable brand in its title, it might get categorized as TCG (the default). Meanwhile, you already have reliable tag-derived columns (`primary_category`, `condition_type`, `normalized_tags`) that are auto-populated by a DB trigger every time tags are set. These are the source of truth and should be checked **first**, not last.

**The Fix — Flip the priority order in `ebayTemplateResolver.ts`:**

Currently (line 112):
```
const detectedCategory = (await detectCategoryFromBrandDB(...)) || item.main_category
```

Change to check tag-derived `primary_category` first, then `main_category`, then brand detection as fallback:
```
const detectedCategory = item.primary_category || item.main_category || (await detectCategoryFromBrandDB(...))
```

Same change in `ebay-sync-processor/index.ts` (lines 379 and 557) where the same pattern appears.

**Why this is better:**
- Tags are already set correctly during intake (comics get tagged "comics", cards get "pokemon"/"tcg", graded items get "graded")
- The DB trigger normalizes everything consistently
- Brand detection becomes a safety net for items missing tags, not the primary method
- No new code needed — just reorder the priority chain

**Files to change:**
1. **`supabase/functions/_shared/ebayTemplateResolver.ts`** — Update `resolveTemplate()` (line 112) and `buildCategoryAwareAspects()` (line 202) to prefer `primary_category` over brand detection
2. **`supabase/functions/ebay-sync-processor/index.ts`** — Update the two `detectedCategory` assignments (lines 379, 557) to use the same priority
3. **`supabase/functions/ebay-sync-processor/index.ts`** — Add `primary_category` and `condition_type` to the SELECT query so these columns are available

**Also ensure the query fetches the tag columns:**
The `ebay-sync-processor` SELECT must include `primary_category` and `condition_type` alongside the existing columns.

