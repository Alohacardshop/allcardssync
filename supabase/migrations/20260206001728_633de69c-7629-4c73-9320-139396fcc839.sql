-- Add price markup percentage column to ebay_store_config
ALTER TABLE public.ebay_store_config 
ADD COLUMN IF NOT EXISTS price_markup_percent numeric DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.ebay_store_config.price_markup_percent IS 'Percentage to add to item price when listing on eBay (e.g., 10 = 10% markup)';