ALTER TABLE ebay_listing_templates 
  ADD COLUMN preferred_condition_ids jsonb DEFAULT NULL;

COMMENT ON COLUMN ebay_listing_templates.preferred_condition_ids IS 
  'Ordered priority list of condition IDs. Processor picks the first valid one for the category.';