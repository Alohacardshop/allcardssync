-- Performance indexes for intake_items table
-- These indexes will significantly speed up inventory queries

-- 1. Partial index on created_at for non-deleted items (most common sort)
CREATE INDEX IF NOT EXISTS idx_intake_items_created_at_not_deleted 
ON intake_items (created_at DESC) 
WHERE deleted_at IS NULL;

-- 2. Partial composite index on location + created_at for non-deleted items
CREATE INDEX IF NOT EXISTS idx_intake_items_location_created_at_not_deleted 
ON intake_items (shopify_location_gid, created_at DESC) 
WHERE deleted_at IS NULL;

-- 3. Partial index for search fields (full-text search)
CREATE INDEX IF NOT EXISTS idx_intake_items_search_fields_not_deleted 
ON intake_items USING gin(to_tsvector('english', 
  coalesce(brand_title, '') || ' ' || 
  coalesce(subject, '') || ' ' || 
  coalesce(category, '') || ' ' || 
  coalesce(variant, '') || ' ' || 
  coalesce(card_number, '') || ' ' || 
  coalesce(sku, '') || ' ' || 
  coalesce(lot_number, '')
)) 
WHERE deleted_at IS NULL;

-- 4. Partial index for price range queries
CREATE INDEX IF NOT EXISTS idx_intake_items_price_not_deleted 
ON intake_items (price) 
WHERE deleted_at IS NULL AND price IS NOT NULL;

-- 5. Partial index for PSA graded vs raw filtering
CREATE INDEX IF NOT EXISTS idx_intake_items_psa_cert_not_deleted 
ON intake_items (psa_cert) 
WHERE deleted_at IS NULL;