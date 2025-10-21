-- Performance indexes for inventory queries (estimated 3-5x speedup)
-- Note: Not using CONCURRENTLY as it's not supported in transactions

-- Composite index for the most common query pattern (store + location + sort)
CREATE INDEX IF NOT EXISTS idx_intake_items_location_status_created 
ON intake_items (store_key, shopify_location_gid, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for quantity filter (active items)
CREATE INDEX IF NOT EXISTS idx_intake_items_active_inventory 
ON intake_items (store_key, shopify_location_gid, quantity, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for tab filtering (type + main_category)
CREATE INDEX IF NOT EXISTS idx_intake_items_type_category 
ON intake_items (store_key, shopify_location_gid, type, main_category, created_at DESC) 
WHERE deleted_at IS NULL;

-- Full-text search index for fast text searches
CREATE INDEX IF NOT EXISTS idx_intake_items_search_gin 
ON intake_items USING gin(
  to_tsvector('english', 
    coalesce(sku, '') || ' ' || 
    coalesce(brand_title, '') || ' ' || 
    coalesce(subject, '') || ' ' || 
    coalesce(card_number, '')
  )
) WHERE deleted_at IS NULL;