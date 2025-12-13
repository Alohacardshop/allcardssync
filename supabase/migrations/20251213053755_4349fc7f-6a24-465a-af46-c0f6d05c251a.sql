-- Phase 1: Update existing Hawaii eBay config
UPDATE ebay_store_config 
SET store_key = 'hawaii', 
    location_key = 'hawaii'
WHERE store_key = 'Hawaii';

-- Phase 2: Create Las Vegas eBay config (sandbox mode with safety controls)
INSERT INTO ebay_store_config (
  store_key,
  location_key,
  environment,
  marketplace_id,
  is_active,
  sync_enabled,
  dry_run_mode,
  sync_mode
) VALUES (
  'las_vegas',
  'las_vegas',
  'sandbox',
  'EBAY_US',
  false,
  false,
  true,
  'manual'
) ON CONFLICT (store_key) DO NOTHING;