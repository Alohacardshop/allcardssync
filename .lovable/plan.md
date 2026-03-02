

## Add 24-Hour In-Memory Caching for eBay Condition Policies and Taxonomy Aspects

### Current State
The dynamic condition and aspect validation is already fully implemented:
- `fetchConditionPolicies()` calls the Metadata API per listing
- `fetchCategoryAspects()` calls the Taxonomy API per listing
- `validateAndResolveCondition()` and `filterAspectsByTaxonomy()` guard against invalid values
- Both `processCreate` and `processUpdate` use these

The only gap is **no caching** — every listing makes 2 extra API calls (~200-400ms each), which is wasteful since condition policies and taxonomy aspects rarely change.

### Plan

**File: `supabase/functions/_shared/ebayApi.ts`**

Add a simple in-memory cache (Map) with 24-hour TTL for both functions:

1. Create a module-level cache Map keyed by `${environment}:${categoryId}` for each function
2. Before making the API call, check if a cached result exists and is less than 24 hours old
3. If cached, return immediately; otherwise fetch, store, and return

```typescript
// Cache structure
const conditionPolicyCache = new Map<string, { data: string[]; ts: number }>()
const categoryAspectCache = new Map<string, { data: Set<string>; ts: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
```

Add cache lookup at the top of `fetchConditionPolicies` and `fetchCategoryAspects`, and cache-store after successful fetch. No other files need changes — the processor already calls these functions.

### Files Modified
- `supabase/functions/_shared/ebayApi.ts` — add caching to `fetchConditionPolicies` and `fetchCategoryAspects`

