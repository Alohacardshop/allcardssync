

# Replace Hardcoded Category Detection with Dynamic DB Lookups

## What Changes

Currently, two functions in `ebayConditions.ts` use hardcoded arrays and switch statements to determine an item's category type and eBay category ID. This means any brand or category changes made by admins in the database are ignored by the core listing logic. This update makes both functions query the database instead, so the entire category resolution chain is fully dynamic.

## What Gets Fixed

- **Brand detection** (`detectCategoryFromBrand`) currently checks a hardcoded list of ~50 brand names. After this change, it will check the `brand_match` arrays stored in `ebay_category_mappings` -- the same data admins manage through the UI.
- **Category ID lookup** (`getEbayCategoryId`) currently returns hardcoded IDs like `'183454'` for TCG. After this change, it will query `ebay_categories` by `item_type` and return whatever ID the admin has configured.
- Both functions become `async` since they now hit the database.

## Implementation Details

### 1. Add two new async functions in `ebayTemplateResolver.ts`

Since these functions now need a Supabase client, they belong in the shared template resolver (which already has DB access) rather than the pure-data `ebayConditions.ts` file.

**`detectCategoryFromBrandDB(supabase, brand)`** -- Queries `ebay_category_mappings` for active rows with `brand_match` arrays. Iterates through mappings and checks if the item's brand matches any entry. Returns the `main_category` value (tcg/sports/comics) from the first match, falling back to the existing hardcoded `detectCategoryFromBrand()` as a safety net.

**`getEbayCategoryIdDB(supabase, category, isGraded)`** -- Queries `ebay_categories` by `item_type` matching the detected category. For comics, filters further based on graded status (looking for "Graded" in the name). Returns the first active category's ID, falling back to the hardcoded `getEbayCategoryId()` as a safety net.

### 2. Update `resolveTemplate()` in `ebayTemplateResolver.ts`

Change line 23 from:
```
const detectedCategory = detectCategoryFromBrand(item.brand_title) || item.main_category
```
to use the new `detectCategoryFromBrandDB()` so the template resolver also benefits from dynamic brand detection.

### 3. Update `buildCategoryAwareAspects()` in `ebayTemplateResolver.ts`

Make this function async and use `detectCategoryFromBrandDB()` instead of the hardcoded version when no category is passed in.

### 4. Update call sites in both edge functions

In `ebay-create-listing/index.ts` (line 140-141) and `ebay-sync-processor/index.ts` (lines 375-376 and 552-553), replace:
```typescript
getEbayCategoryId(detectCategoryFromBrand(item.brand_title) || item.main_category, isGraded)
```
with:
```typescript
await getEbayCategoryIdDB(supabase, detectedCategory || item.main_category, isGraded)
```

Also update `buildCategoryAwareAspects()` calls to `await` since it becomes async.

Remove the now-unused imports of `detectCategoryFromBrand` and `getEbayCategoryId` from both edge functions.

### 5. Keep hardcoded data as fallback safety net

The hardcoded `CATEGORY_BRAND_PATTERNS` and `EBAY_CATEGORY_IDS` constants in `ebayConditions.ts` stay unchanged. The new DB functions fall back to the old hardcoded functions if the database query returns no results. This ensures listings still work even if the `ebay_categories` table is empty or the DB is temporarily unreachable.

## Files Modified

- `supabase/functions/_shared/ebayTemplateResolver.ts` -- Add `detectCategoryFromBrandDB()`, `getEbayCategoryIdDB()`, make `buildCategoryAwareAspects()` async, update `resolveTemplate()` to use DB detection
- `supabase/functions/ebay-create-listing/index.ts` -- Use new async DB functions, remove unused imports
- `supabase/functions/ebay-sync-processor/index.ts` -- Use new async DB functions, remove unused imports

## Files NOT Modified

- `supabase/functions/_shared/ebayConditions.ts` -- Unchanged. Hardcoded constants and functions remain as fallback safety nets. No code is removed.

