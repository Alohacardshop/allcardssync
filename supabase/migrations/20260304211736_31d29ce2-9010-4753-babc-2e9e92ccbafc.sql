INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES 
  ('hawaii', 'services.shopify_sync', 'false', 'Enable Shopify inventory sync'),
  ('hawaii', 'services.discord_notifications', 'false', 'Enable Discord order notifications'),
  ('las_vegas', 'services.shopify_sync', 'false', 'Enable Shopify inventory sync'),
  ('las_vegas', 'services.discord_notifications', 'false', 'Enable Discord order notifications')
ON CONFLICT (region_id, setting_key) DO NOTHING;