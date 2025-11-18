-- Drop the overly restrictive unique constraint on (store_key, sku)
-- This constraint prevents the same SKU from existing at multiple locations in the same store
DROP INDEX IF EXISTS public.uniq_active_sku_per_store;

-- The correct uniqueness is already handled by uniq_store_sku_location constraint
-- which includes the location: (store_key, sku, shopify_location_gid)