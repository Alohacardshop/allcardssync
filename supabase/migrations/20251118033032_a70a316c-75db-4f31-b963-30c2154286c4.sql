-- Drop the overly restrictive unique constraint on shopify_product_id
-- This constraint prevents the same Shopify product from existing multiple times,
-- but a single product can have multiple variants at different locations
DROP INDEX IF EXISTS public.uniq_active_shopify_product_id;

-- The correct uniqueness is handled by uniq_store_sku_location constraint
-- which ensures: one SKU per store per location (allowing same product with different variants/locations)
COMMENT ON CONSTRAINT uniq_store_sku_location ON public.intake_items IS 
'Ensures uniqueness of SKU per store per location - allows same product with different variants/locations';