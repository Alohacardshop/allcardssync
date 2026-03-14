
-- Add is_hidden column to shopify_location_cache
ALTER TABLE public.shopify_location_cache
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

-- Hide the locations the user doesn't want to see
UPDATE public.shopify_location_cache
SET is_hidden = true
WHERE location_gid IN (
  'gid://shopify/Location/77127286959',  -- Employee Purchases
  'gid://shopify/Location/80896327855',  -- Kahala Singles
  'gid://shopify/Location/80896426159',  -- Ward Singles
  'gid://shopify/Location/80609509551',  -- Warehouse Online
  'gid://shopify/Location/80896393391'   -- Windward Singles
);
