

## Summary
Replace the "Category" filter (based on `intake_items.category`) with a **Shopify Collections** filter. Collections are a native Shopify concept for grouping products and are more aligned with how merchants organize their stores.

## Current State
- **Category filter**: Uses `intake_items.category` column (Shopify `productType`)
- **Collections**: Not currently synced or stored - Shopify collections data is never pulled into the database
- **Products**: Only individual product/variant data is synced, not collection membership

## Proposed Architecture

### 1. Database Schema (New Table)
Create a `shopify_collections` cache table to store collections from Shopify:

```sql
CREATE TABLE public.shopify_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  collection_gid text NOT NULL,  -- gid://shopify/Collection/123
  title text NOT NULL,
  handle text,
  product_count integer DEFAULT 0,
  collection_type text,  -- 'custom' or 'smart'
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(store_key, collection_gid)
);
```

### 2. New Edge Function: `fetch-shopify-collections`
Create an edge function (following the `fetch-shopify-locations` pattern) that:
- Fetches all collections from Shopify using GraphQL Admin API
- Caches them in `shopify_collections` table
- Returns collection list with product counts

**GraphQL Query:**
```graphql
query {
  collections(first: 250) {
    edges {
      node {
        id
        title
        handle
        productsCount { count }
        ruleSet { rules { column, relation, condition } }
      }
    }
  }
}
```

### 3. Frontend Hook: `useShopifyCollections`
New hook that:
- Calls `fetch-shopify-collections` edge function
- Caches results with React Query (5 min stale time)
- Returns `{ collections, isLoading, refetch }`

### 4. Filter Integration
The "Category" dropdown in `MoreFiltersPopover` becomes "Collection":
- Lists all Shopify collections with product counts
- Selection filters inventory by querying Shopify for products in that collection

### 5. Query Logic Update
When a collection is selected:
- Option A: Filter by collection membership (requires adding `collection_gid` to `intake_items`)
- **Option B (Recommended)**: Use Shopify API to get product IDs in collection, then filter `intake_items.shopify_product_id IN (...)`

---

## Technical Implementation Details

| Component | Changes |
|-----------|---------|
| **Database** | New `shopify_collections` table with RLS policies |
| **Edge Function** | New `fetch-shopify-collections` function |
| **Hook** | New `src/hooks/useShopifyCollections.ts` |
| **Types** | Update `InventoryCategoryFilter` → `InventoryCollectionFilter` |
| **MoreFiltersPopover** | Replace category dropdown with collections dropdown |
| **InventoryPage** | Integrate new hook, pass data down |
| **useInventoryListQuery** | Update filter logic for collection-based filtering |
| **ActiveFilterChips** | Display collection name instead of category |

### Edge Function Structure
```typescript
// supabase/functions/fetch-shopify-collections/index.ts
// 1. Authenticate request
// 2. Get Shopify credentials using resolveShopifyConfig()
// 3. Execute GraphQL query for collections
// 4. Upsert results to shopify_collections table
// 5. Return collection list
```

### Filter Query Strategy
When collection filter is active:
1. Edge function query: Get products in collection from Shopify
2. Extract product GIDs
3. Filter `intake_items` with `.in('shopify_product_id', productGids)`

This approach avoids storing collection membership per item and stays synced with Shopify's live collection definitions.

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/xxx_add_shopify_collections.sql` | Create table + RLS |
| `supabase/functions/fetch-shopify-collections/index.ts` | New edge function |
| `src/hooks/useShopifyCollections.ts` | New hook |
| `src/hooks/useInventoryListQuery.ts` | Update filter logic |
| `src/features/inventory/types.ts` | Rename category types to collection |
| `src/components/inventory/MoreFiltersPopover.tsx` | Replace category UI |
| `src/features/inventory/pages/InventoryPage.tsx` | Integrate collections hook |
| `src/components/inventory/ActiveFilterChips.tsx` | Update chip display |

