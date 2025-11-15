-- Add eBay price check field to intake_items table
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS ebay_price_check jsonb;

-- Add index for faster queries on items with eBay price checks
CREATE INDEX IF NOT EXISTS idx_intake_items_ebay_price_check 
ON public.intake_items USING gin(ebay_price_check)
WHERE ebay_price_check IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.intake_items.ebay_price_check IS 'Stores eBay price comparison data including average sold prices, outliers, and last check timestamp';