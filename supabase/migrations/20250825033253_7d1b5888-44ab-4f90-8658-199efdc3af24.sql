-- Add store-specific Shopify settings for Las Vegas and Hawaii stores
INSERT INTO public.system_settings (key_name, key_value, description, is_encrypted, category)
VALUES 
  -- Las Vegas Store Shopify Settings
  ('SHOPIFY_LAS_VEGAS_API_KEY', '', 'Shopify API Key for Las Vegas Store', true, 'shopify'),
  ('SHOPIFY_LAS_VEGAS_API_SECRET', '', 'Shopify API Secret for Las Vegas Store', true, 'shopify'),
  ('SHOPIFY_LAS_VEGAS_STORE_DOMAIN', '', 'Shopify store domain for Las Vegas Store (e.g., lasvegas.myshopify.com)', true, 'shopify'),
  ('SHOPIFY_LAS_VEGAS_ACCESS_TOKEN', '', 'Shopify Admin API access token for Las Vegas Store', true, 'shopify'),
  ('SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET', '', 'Shopify Webhook Secret for Las Vegas Store', true, 'shopify'),
  
  -- Hawaii Store Shopify Settings  
  ('SHOPIFY_HAWAII_API_KEY', '', 'Shopify API Key for Hawaii Store', true, 'shopify'),
  ('SHOPIFY_HAWAII_API_SECRET', '', 'Shopify API Secret for Hawaii Store', true, 'shopify'),
  ('SHOPIFY_HAWAII_STORE_DOMAIN', '', 'Shopify store domain for Hawaii Store (e.g., hawaii.myshopify.com)', true, 'shopify'),
  ('SHOPIFY_HAWAII_ACCESS_TOKEN', '', 'Shopify Admin API access token for Hawaii Store', true, 'shopify'),
  ('SHOPIFY_HAWAII_WEBHOOK_SECRET', '', 'Shopify Webhook Secret for Hawaii Store', true, 'shopify')
ON CONFLICT (key_name) DO NOTHING;