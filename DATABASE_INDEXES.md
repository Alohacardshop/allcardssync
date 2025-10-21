# Database Performance: Indexes Guide

## Quick Start

Your database already has a **recommended-indexes.sql** file with optimized indexes. To apply them:

1. Open your **Supabase SQL Editor**
2. Copy the contents of `recommended-indexes.sql`
3. Run the SQL
4. Wait for indexes to build (uses `CONCURRENTLY` to avoid blocking)

## Expected Performance Gains

| Index | Query Speed Improvement | Use Case |
|-------|------------------------|----------|
| `idx_intake_items_created_at_not_deleted` | 2-5x faster | Default sort on Inventory page |
| `idx_intake_items_location_created_at_not_deleted` | 3-10x faster | Location-filtered queries |
| `idx_intake_items_search_fields_not_deleted` | 5-20x faster | Full-text search |
| `idx_intake_items_price_not_deleted` | 2-4x faster | Price range filters |
| `idx_intake_items_psa_cert_not_deleted` | 2-3x faster | Graded vs Raw filtering |

## Already Applied?

Check if indexes exist:

```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'intake_items' 
  AND schemaname = 'public';
```

Look for index names starting with `idx_intake_items_`.

## Monitoring Query Performance

Enable query stats in Supabase:
1. Go to **Database** → **Logs** → **Postgres Logs**
2. Filter for slow queries (> 500ms)
3. Check if missing indexes are causing slowness

## When to Add More Indexes

Add custom indexes if you frequently filter by:
- Specific columns not covered above
- Complex combinations (e.g., `store_key + type + main_category`)
- JSON fields in `catalog_snapshot`

**Example custom index:**
```sql
CREATE INDEX CONCURRENTLY idx_intake_items_store_type_category 
ON intake_items (store_key, type, main_category, created_at DESC) 
WHERE deleted_at IS NULL;
```

## Performance Checklist

- [x] Reduced query limit from 50 to 25 items
- [x] Changed `!inner` join to left join (optional lot data)
- [x] Implemented virtual scrolling (renders only ~10 visible items)
- [x] Moved all filtering to database queries
- [x] Added React Query caching (1 min stale time)
- [ ] **Apply recommended-indexes.sql** ← Do this now!

## Support

If queries are still slow after adding indexes:
1. Share the slow query from Postgres Logs
2. Run `EXPLAIN ANALYZE` on the query
3. Check if you need composite indexes for your specific filters
