-- Insert eBay location priority for Hawaii store (retail locations for waterfall fulfillment)
INSERT INTO ebay_location_priority (store_key, shopify_location_gid, location_name, priority, is_active)
VALUES
  ('hawaii', 'gid://shopify/Location/67325100207', 'Ward Ave', 0, true),
  ('hawaii', 'gid://shopify/Location/78602010799', 'Aloha Card Shop Kahala', 1, true),
  ('hawaii', 'gid://shopify/Location/71769456815', 'Aloha Card Shop Windward Mall', 2, true)
ON CONFLICT (store_key, shopify_location_gid)
DO UPDATE SET location_name = EXCLUDED.location_name, priority = EXCLUDED.priority, is_active = EXCLUDED.is_active;