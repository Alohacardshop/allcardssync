-- Add Best Offer fields to ebay_listing_templates
ALTER TABLE public.ebay_listing_templates
  ADD COLUMN best_offer_enabled boolean DEFAULT false,
  ADD COLUMN auto_accept_price numeric DEFAULT null,
  ADD COLUMN auto_decline_price numeric DEFAULT null;

COMMENT ON COLUMN public.ebay_listing_templates.best_offer_enabled IS 'Whether Best Offer is enabled for listings using this template';
COMMENT ON COLUMN public.ebay_listing_templates.auto_accept_price IS 'Automatically accept offers at or above this amount (USD)';
COMMENT ON COLUMN public.ebay_listing_templates.auto_decline_price IS 'Automatically decline offers below this amount (USD)';