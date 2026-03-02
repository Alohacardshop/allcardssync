
-- Rename auto_decline_price to auto_decline_percent
ALTER TABLE public.ebay_listing_templates RENAME COLUMN auto_decline_price TO auto_decline_percent;

-- Null out existing values since they were dollar amounts, not percentages
UPDATE public.ebay_listing_templates SET auto_decline_percent = NULL WHERE auto_decline_percent IS NOT NULL;
