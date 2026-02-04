

# Shopify Tag-Based Filtering Enhancement

## Summary
Add a new "Shopify Tags" filter to the Inventory page that lets you filter by the actual tags from Shopify (like "pokemon", "baseball", "graded", etc.), while keeping the existing Raw/Graded/Comics categories only for items imported through this system.

## Current State
- Shopify products have rich tags stored in `shopify_snapshot.tags` (e.g., `["graded", "pokemon", "PSA"]`)
- Most common tags: graded (497), pokemon (369), single (299), baseball (160), basketball (129), football (80)
- Currently all Shopify-imported items have `type: 'Raw'` and `main_category: null`
- The Type filter (Raw/Graded) doesn't work correctly for Shopify imports

## Solution Overview

### 1. Add "shopify_tags" Column
Store the raw Shopify tags as a dedicated column for efficient filtering:
- Add `shopify_tags TEXT[]` column to `intake_items` table
- Populate during import from `shopify_snapshot.tags`
- Create GIN index for fast array contains queries

### 2. New Multi-Select Tag Filter in UI
Add a new filter dropdown that shows available Shopify tags:
- Dynamic list based on tags actually in inventory
- Multi-select capability (e.g., filter by "pokemon" AND "graded")
- Show item count per tag

**Tag filter options to display:**
```
- graded (497)
- pokemon (369)
- single (299)
- baseball (160)
- basketball (129)
- football (80)
- tcg (58)
- PSA (251)
- CGC (34)
- Sealed (6)
```

### 3. Update Category Filter Logic
Distinguish between Shopify-imported and internally-created items:
- **Shopify-imported**: Use `shopify_tags` for filtering (source_provider = 'shopify-pull')
- **Internally-created**: Use existing `type`, `main_category` fields

### 4. Quick Filter Presets for Popular Tags
Add new quick filter presets:
- "Pokemon Cards" - filters by tag "pokemon"
- "Sports Cards" - filters by tags "baseball" OR "basketball" OR "football"
- "Graded Items" - filters by tag "graded"

## Technical Implementation

### Database Changes

**New column and index:**
```sql
-- Add shopify_tags column
ALTER TABLE intake_items 
ADD COLUMN IF NOT EXISTS shopify_tags TEXT[];

-- Create GIN index for fast array queries
CREATE INDEX IF NOT EXISTS idx_intake_items_shopify_tags 
ON intake_items USING GIN (shopify_tags);

-- Backfill existing data from shopify_snapshot
UPDATE intake_items 
SET shopify_tags = ARRAY(
  SELECT jsonb_array_elements_text(shopify_snapshot->'tags')
)
WHERE shopify_snapshot IS NOT NULL 
  AND shopify_snapshot->'tags' IS NOT NULL
  AND shopify_tags IS NULL;
```

### Files to Modify

1. **`supabase/functions/shopify-pull-products-by-tags/index.ts`**
   - Add `p_shopify_tags` parameter to RPC call
   - Extract tags array from product and pass to upsert

2. **`src/hooks/useInventoryListQuery.ts`**
   - Add `tagFilter: string[]` to `InventoryFilters`
   - Add query logic: `.overlaps('shopify_tags', tagFilter)` when tags selected

3. **`src/hooks/useShopifyTags.ts`** (new file)
   - Hook to fetch distinct tags with counts
   - Cache results for filter dropdown

4. **`src/pages/Inventory.tsx`**
   - Add new Tag Filter multi-select dropdown
   - State: `const [tagFilter, setTagFilter] = useState<string[]>([])`
   - Pass to query hook

5. **`src/components/inventory/TagFilterDropdown.tsx`** (new file)
   - Multi-select dropdown component
   - Shows tags with item counts
   - Search/filter within tags list

6. **`src/components/inventory/QuickFilterPresets.tsx`**
   - Add "Pokemon", "Sports Cards", "Graded" presets

### Query Example
```typescript
// In useInventoryListQuery.ts
if (tagFilter && tagFilter.length > 0) {
  // Filter items that have ANY of the selected tags
  query = query.overlaps('shopify_tags', tagFilter);
}
```

## UI Changes

### Filters Section Layout
```
Row 1: [Search........] [Status▾] [Type▾] [Category▾]
Row 2: [Location▾] [Tags ▾] [Shopify▾] [eBay▾] [Print▾] [Date▾] [Batch▾]
                    ↑ NEW
```

### Tags Filter Dropdown
```
┌─ Tags Filter ──────────────┐
│ 🔍 Search tags...          │
├────────────────────────────┤
│ ☑ pokemon (369)            │
│ ☐ baseball (160)           │
│ ☐ basketball (129)         │
│ ☐ football (80)            │
│ ☐ graded (497)             │
│ ☐ single (299)             │
│ ☐ Sealed (6)               │
│ ☐ PSA (251)                │
│ ☐ CGC (34)                 │
└────────────────────────────┘
```

## Implementation Order

| Step | Task | Effort |
|------|------|--------|
| 1 | Add `shopify_tags` column and index | Small |
| 2 | Backfill existing data from shopify_snapshot | Small |
| 3 | Update Shopify import to populate `shopify_tags` | Small |
| 4 | Create `useShopifyTags` hook | Small |
| 5 | Create `TagFilterDropdown` component | Medium |
| 6 | Add tag filter to Inventory.tsx | Medium |
| 7 | Update `useInventoryListQuery` for tag filtering | Medium |
| 8 | Add Quick Filter presets (Pokemon, Sports, Graded) | Small |
| 9 | Test end-to-end with various tag combinations | Medium |

## Benefits

1. **Filter by actual Shopify data** - no need to re-categorize imported items
2. **Multi-select capability** - combine tags like "pokemon" + "graded"
3. **Clear separation** - Raw/Graded/Comics categories reserved for manual imports
4. **Fast queries** - GIN index on array column for efficient filtering
5. **Dynamic tags** - filter options based on what's actually in inventory

