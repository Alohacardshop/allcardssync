-- Add Shopify integration columns and quantity tracking to intake_items
ALTER TABLE public.intake_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shopify_product_id text,
  ADD COLUMN IF NOT EXISTS shopify_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text;

-- Helpful index for SKU lookups
CREATE INDEX IF NOT EXISTS idx_intake_items_sku ON public.intake_items (sku);
