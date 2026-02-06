

# Deep Code Review: Inventory & Shopify Sync System

## Executive Summary
The codebase is well-structured with a modular feature-based architecture. The recent migration successfully fixed 1,940 items that were incorrectly showing "Pending" status. However, I've identified several issues and improvement opportunities.

---

## Critical Issues Found

### 1. Collection Filter Not Implemented (HIGH)
**Location:** `src/hooks/useInventoryListQuery.ts`

The `collectionFilter` parameter is:
- Defined in the filter interface (line 15)
- Included in the queryKey for cache invalidation (line 41)
- Extracted from filters (line 61)
- **But never applied to the actual query!**

There's no logic like `if (collectionFilter !== 'all')` to filter items by collection.

**Impact:** Users can select a Shopify collection in the UI but the filter has no effect - all items are still shown.

**Fix Required:** Implement collection filtering by fetching product IDs from the collection and filtering with `.in('shopify_product_id', productGids)`.

---

### 2. Remaining Pending Items with Product IDs (MEDIUM)
**Current State:** 20 items show `shopify_sync_status = 'pending'` but have valid `shopify_product_id` values.

**Root Cause:** These items were synced TO Shopify via the TCGPlayer intake flow (source_provider = 'tcgplayer'), which doesn't update the sync status to 'synced' after successful sync.

**Evidence:**
```
sku:4150174 | product_id:9398236774631 | status:pending | source:tcgplayer
```

**Fix Required:** Update the sync functions (v2-shopify-send-graded, v2-shopify-send-raw) to set `shopify_sync_status = 'synced'` after successful product creation/update.

---

## Architecture Observations

### Strengths
1. **Well-structured feature modules** - Inventory code is properly organized in `src/features/inventory/`
2. **Centralized inventory writes** - All Shopify inventory operations go through `_shared/inventory-write.ts` with audit logging
3. **Comprehensive type system** - Types are well-defined in `src/types/inventory.ts` and feature modules
4. **Smart caching strategy** - 5-minute staleTime with context-aware refresh intervals
5. **Good error handling** - Retry jobs, dead letter queue (currently empty = healthy)
6. **Keyboard navigation** - Full ArrowUp/Down support in inspector panel

### Database Function Fix Verified
The `upsert_shopify_intake_item` function now correctly sets:
```sql
shopify_sync_status = 'synced',
last_shopify_synced_at = NOW()
```
This ensures future imports from Shopify are marked correctly.

---

## Recommended Improvements

### High Priority

| Issue | File(s) | Effort |
|-------|---------|--------|
| Implement collection filter | `useInventoryListQuery.ts` | Medium |
| Fix TCGPlayer sync status | `v2-shopify-send-graded/raw` | Low |
| Clear remaining 20 pending items | One-time data fix | Low |

### Medium Priority

| Improvement | Description |
|-------------|-------------|
| Status consistency | Consider adding a database trigger to auto-set `shopify_sync_status = 'synced'` when `shopify_product_id` is set |
| Query optimization | The location availability filter makes 2 queries - could be combined with a JOIN |
| Error aggregation | Add summary counts to the status strip (X errors, Y pending) |

### Low Priority (Nice-to-Have)

| Improvement | Description |
|-------------|-------------|
| Type guard helpers | Add runtime validation for `shopify_snapshot` shape |
| Batch size tuning | Current PAGE_SIZE of 25 could be increased for power users |
| Offline detection | Show indicator when network is unavailable |

---

## Data Health Summary

| Metric | Count | Status |
|--------|-------|--------|
| Total Synced | 2,611 | Good |
| Pending (needs sync) | 20 | Investigate |
| Errors | 0 | Good |
| Dead Letter Queue | 0 | Healthy |
| Retry Jobs | 0 | Healthy |

---

## Recommended Next Steps

1. **Immediate:** Fix the 20 remaining pending items with a data correction query
2. **Short-term:** Implement the collection filter (users are seeing the UI but it doesn't work)
3. **Short-term:** Update sync functions to set status correctly
4. **Optional:** Add a database trigger as a safety net for sync status consistency

