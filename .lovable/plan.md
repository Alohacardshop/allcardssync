
# Inventory Management Optimization - Phase 2

## Analysis Summary

After a deep dive into the current implementation, I've identified these key opportunities for improvement:

### Current State
| Metric | Value | Notes |
|--------|-------|-------|
| Total Items | 2,615 | Active (non-deleted) |
| Pending Sync | 1,939 | 74% not synced to Shopify |
| Synced | 655 | 25% synced |
| Sync Errors | 20 | Need attention |
| Unset Categories | 505 | Missing `primary_category` |
| Unset Condition | 318 | Missing `condition_type` |

### Identified Issues

1. **Tag Hook Inefficiency**: `useShopifyTags` fetches ALL items then counts tags client-side (N+1 problem)
2. **No Real-time Updates**: Inventory list doesn't use Supabase Realtime for sync status changes
3. **Stale Normalization Data**: 505 items still have `primary_category = null` despite having tags
4. **Large Filter UI**: 12+ filter dropdowns across 2 rows - overwhelming for users
5. **Duplicate Quick Filters**: Category/Type filters overlap with tag-based presets
6. **Missing Keyboard Shortcuts**: No way to quickly navigate/select items
7. **Tag Editor Not Connected**: The TagEditor component exists but isn't rendered in InventoryItemCard

## Proposed Improvements

### 1. Database-Level Tag Aggregation (Performance)
Replace client-side tag counting with a PostgreSQL function for instant results.

**Benefits:**
- 100x faster tag loading (single query vs scanning all rows)
- Reduced network payload (counts only, not full items)
- Enables real-time tag counts in filter dropdown

**Technical approach:**
```sql
CREATE OR REPLACE FUNCTION get_tag_counts(p_store_key TEXT)
RETURNS TABLE(tag TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT unnest(normalized_tags) as tag, COUNT(*) as count
  FROM intake_items
  WHERE store_key = p_store_key AND deleted_at IS NULL
  GROUP BY 1
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 2. Real-time Sync Status Updates
Add Supabase Realtime subscription to automatically update item cards when sync status changes.

**Benefits:**
- Instant feedback when items sync (no manual refresh needed)
- Reduced polling overhead
- Better UX - users see "Syncing..." change to "Synced" live

**Technical approach:**
- Subscribe to `intake_items` changes filtered by `store_key`
- Update React Query cache optimistically when sync events arrive
- Pause subscription when user has active selection (prevent layout shifts)

### 3. Fix Normalization Backfill
Run a migration to re-normalize the 505 items with missing categories.

**Root cause:** Items imported before the normalization trigger was created.

**Technical approach:**
```sql
UPDATE intake_items
SET 
  normalized_tags = normalize_shopify_tags(shopify_tags),
  updated_at = NOW()
WHERE 
  shopify_tags IS NOT NULL 
  AND (normalized_tags IS NULL OR primary_category IS NULL);
```

### 4. Consolidated Filter UI
Reduce visual clutter by collapsing secondary filters into a "More Filters" popover.

**Current layout (2 rows, 12 dropdowns):**
```text
Row 1: [Search] [Status] [Type] [Category]
Row 2: [Location] [Shopify] [eBay] [Print] [Date] [Batch] [Tags]
```

**Proposed layout (1 row + popover):**
```text
[Search............] [Status] [Location] [⚙ More]
                                          └─ Type, Category, Shopify, eBay, 
                                             Print, Date, Batch, Tags
```

**Benefits:**
- Cleaner interface for common operations
- Power filters still accessible
- Matches Shopify's own filter pattern

### 5. Connect Tag Editor to Item Cards
The TagEditor component exists but isn't being rendered. Add it to InventoryItemCard.

**Changes:**
- Import TagEditor into InventoryItemCard
- Add "Edit Tags" button next to the tag badges
- Include normalized_tags in the item detail prefetch

### 6. Keyboard Navigation
Add keyboard shortcuts for power users.

| Shortcut | Action |
|----------|--------|
| `j/k` | Move selection up/down |
| `x` | Toggle item selection |
| `Shift+A` | Select all visible |
| `Escape` | Clear selection |
| `s` | Sync selected items |
| `/` | Focus search |

**Technical approach:**
- Use `useHotkeys` pattern with `event.preventDefault()`
- Track focused item index in state
- Scroll virtualizer to keep focused item visible

### 7. Optimistic UI for Tag Updates
When editing tags, update the UI immediately before the server confirms.

**Current flow:**
```text
Edit tags → Save → Wait for DB → Invalidate cache → Re-fetch → Update UI
```

**Proposed flow:**
```text
Edit tags → Update UI immediately → Save to DB → Rollback if error
```

## Implementation Priority

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| 1 | Fix normalization backfill | Data quality | Small |
| 2 | Database tag aggregation function | Performance | Small |
| 3 | Connect TagEditor to ItemCard | Feature complete | Small |
| 4 | Real-time sync status updates | UX | Medium |
| 5 | Consolidated filter UI | UX | Medium |
| 6 | Optimistic UI for tags | UX | Small |
| 7 | Keyboard navigation | Power users | Medium |

## Files to Modify

1. **Database Migration**
   - Create `get_tag_counts()` function
   - Re-run normalization backfill

2. **`src/hooks/useShopifyTags.ts`**
   - Call new RPC function instead of fetching all items

3. **`src/hooks/useInventoryListQuery.ts`**
   - Add Realtime subscription for sync status changes

4. **`src/components/InventoryItemCard.tsx`**
   - Import and render TagEditor component
   - Add `shopify_tags` and `normalized_tags` to memo comparison

5. **`src/pages/Inventory.tsx`**
   - Consolidate filters into "More Filters" popover
   - Add keyboard event handlers
   - Subscribe to Realtime channel

6. **`src/components/inventory/MoreFiltersPopover.tsx`** (new)
   - Popover containing secondary filter dropdowns

## Expected Outcomes

- **Performance**: Tag loading 100x faster
- **UX**: Live sync status updates without refresh
- **Data Quality**: All items properly categorized
- **Usability**: Cleaner filter UI, keyboard navigation
- **Feature Complete**: Tag editing works from item cards
