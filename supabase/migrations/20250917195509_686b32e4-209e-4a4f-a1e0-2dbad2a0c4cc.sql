-- Update shopify_stores table with correct domain values from system_settings
UPDATE public.shopify_stores 
SET domain = 'aloha-card-shop.myshopify.com'
WHERE key = 'hawaii';

UPDATE public.shopify_stores 
SET domain = 'vqvxdi-ar.myshopify.com'
WHERE key = 'las_vegas';

-- Also ensure we have the store records if they don't exist
INSERT INTO public.shopify_stores (key, name, domain, api_version) 
VALUES 
  ('hawaii', 'Hawaii Store', 'aloha-card-shop.myshopify.com', '2024-07'),
  ('las_vegas', 'Las Vegas Store', 'vqvxdi-ar.myshopify.com', '2024-07')
ON CONFLICT (key) DO UPDATE SET 
  domain = EXCLUDED.domain,
  updated_at = now();