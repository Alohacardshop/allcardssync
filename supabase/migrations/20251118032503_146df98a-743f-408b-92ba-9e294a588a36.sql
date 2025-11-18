-- Drop the partial unique index
DROP INDEX IF EXISTS public.idx_intake_items_shopify_unique;

-- Create a full unique constraint instead
-- This will allow upserts to work properly
ALTER TABLE public.intake_items
ADD CONSTRAINT uniq_store_sku_location 
UNIQUE (store_key, sku, shopify_location_gid);