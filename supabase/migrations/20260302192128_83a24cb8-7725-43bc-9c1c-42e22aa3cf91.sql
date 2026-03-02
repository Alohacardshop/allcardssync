
ALTER TABLE public.ebay_listing_templates 
  ADD COLUMN IF NOT EXISTS marketplace_id text NOT NULL DEFAULT 'EBAY_US';

COMMENT ON COLUMN public.ebay_listing_templates.marketplace_id IS 
  'eBay marketplace for this template. Used for metadata/taxonomy API calls.';
