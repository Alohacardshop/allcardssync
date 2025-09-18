-- Fix Shopify access token key naming for hawaii store
-- The shopify-sync function expects SHOPIFY_ACCESS_TOKEN_HAWAII format

INSERT INTO system_settings (key_name, key_value, description, category, is_encrypted) 
VALUES ('SHOPIFY_ACCESS_TOKEN_HAWAII', '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', 'Shopify access token for Hawaii store (sync function format)', 'shopify', true)
ON CONFLICT (key_name) DO UPDATE SET 
  key_value = EXCLUDED.key_value, 
  updated_at = now();