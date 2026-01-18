-- Update both store configs to production environment
UPDATE public.ebay_store_config 
SET environment = 'production', updated_at = now()
WHERE store_key IN ('hawaii', 'las_vegas');