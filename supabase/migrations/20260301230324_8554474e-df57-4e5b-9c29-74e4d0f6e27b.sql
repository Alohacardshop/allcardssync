-- Add price_markup_percent to ebay_listing_templates
ALTER TABLE public.ebay_listing_templates
ADD COLUMN IF NOT EXISTS price_markup_percent numeric DEFAULT NULL;