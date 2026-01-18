-- Fix Las Vegas store key inconsistency: standardize on 'las_vegas'

-- Update listing templates
UPDATE public.ebay_listing_templates 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';

-- Update category mappings
UPDATE public.ebay_category_mappings 
SET store_key = 'las_vegas'
WHERE store_key = 'lasvegas';

-- Update fulfillment policies
UPDATE public.ebay_fulfillment_policies 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';

-- Update payment policies
UPDATE public.ebay_payment_policies 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';

-- Update return policies
UPDATE public.ebay_return_policies 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';

-- Update sync log
UPDATE public.ebay_sync_log 
SET store_key = 'las_vegas'
WHERE store_key = 'lasvegas';

-- Update inventory aggregate
UPDATE public.ebay_inventory_aggregate 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';

-- Update location priority
UPDATE public.ebay_location_priority 
SET store_key = 'las_vegas', updated_at = now()
WHERE store_key = 'lasvegas';