

## Dynamic eBay Condition + Aspect Resolution

### Problem
The current code uses hardcoded condition IDs and aspect names. If a condition ID is invalid for a category (like `2750` was for Comics), the listing fails. The user wants policy-driven, API-fetched validation instead of relying on static mappings.

### Solution Overview
Add two new eBay API helper functions and integrate them into the sync processor's `processCreate` and `processUpdate` flows.

### Changes

#### 1. New helper functions in `supabase/functions/_shared/ebayApi.ts`

Add two new functions:

- **`fetchConditionPolicies(accessToken, environment, marketplaceId, categoryId)`**
  - Calls `GET /sell/metadata/v1/marketplace/{marketplaceId}/get_item_condition_policies?filter=categoryIds:{categoryId}`
  - Returns array of valid condition IDs for that category
  - Caches nothing (called per-listing, fast enough)

- **`fetchCategoryAspects(accessToken, environment, categoryId, categoryTreeId)`**
  - Calls `GET /sell/taxonomy/v1/category_tree/{categoryTreeId}/get_item_aspects_for_category?category_id={categoryId}`
  - Returns the set of valid aspect names for that category
  - `categoryTreeId` defaults to `0` for EBAY_US

#### 2. New validation function in `supabase/functions/_shared/ebayConditions.ts`

- **`validateAndResolveCondition(validConditionIds, preferredConditionId, isGraded)`**
  - If `preferredConditionId` is in the valid list, use it
  - Otherwise pick best fallback: for graded items try `3000` (Like New), then first available; for ungraded try `4000`, then first available
  - Returns the chosen condition ID

- **`filterAspectsByTaxonomy(aspects, validAspectNames)`**
  - Takes the built aspects object and the taxonomy response
  - Removes any aspect key not present in the taxonomy response
  - Ensures only valid aspect names are sent to eBay

#### 3. Update `processCreate` in `supabase/functions/ebay-sync-processor/index.ts`

Between template resolution and inventory item creation (around line 380-470):

1. Call `fetchConditionPolicies` with the resolved `categoryId`
2. Pass the template's `conditionId` through `validateAndResolveCondition` — if invalid, use fallback
3. Call `fetchCategoryAspects` with the `categoryId`
4. Filter the built `aspects` through `filterAspectsByTaxonomy`
5. For graded comics, ensure `"Professional Grader"`, `"Grade"`, `"Certification Number"`, and `"Graded": ["Yes"]` are added to aspects if those aspect names exist in taxonomy

#### 4. Update `processUpdate` similarly (around line 575-650)

Same validation logic as `processCreate`.

#### 5. Update `buildComicAspects` in `ebayConditions.ts`

Add grading aspects that match eBay Comics taxonomy:
- `"Professional Grader": ["PSA"]`  
- `"Grade": ["10"]`
- `"Certification Number": ["146094215"]`
- `"Graded": ["Yes"]`

These are already partially there but the keys need to match exactly what eBay's taxonomy returns for category 63.

### Technical Detail

The two eBay API calls add ~200-400ms per listing but provide correctness guarantees. The condition policy check prevents the `"Could not serialize field [condition]"` error entirely. The taxonomy check prevents invalid aspect names from being rejected.

The flow becomes:
```text
Template condition_id (e.g. "3000")
    │
    ▼
fetchConditionPolicies(categoryId) → [list of valid IDs]
    │
    ▼
validateAndResolveCondition(validIds, "3000", isGraded)
    │
    ▼
Use validated condition ID in inventory_item payload
```

### Files Modified
- `supabase/functions/_shared/ebayApi.ts` — add `fetchConditionPolicies`, `fetchCategoryAspects`
- `supabase/functions/_shared/ebayConditions.ts` — add `validateAndResolveCondition`, `filterAspectsByTaxonomy`
- `supabase/functions/ebay-sync-processor/index.ts` — integrate validation in `processCreate` and `processUpdate`

