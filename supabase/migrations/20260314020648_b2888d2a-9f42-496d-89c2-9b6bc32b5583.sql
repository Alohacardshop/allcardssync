
-- Function to get intake_item IDs that have stock at a specific location or anywhere
-- Replaces the unbounded client-side fetch of all inventory levels
CREATE OR REPLACE FUNCTION public.get_items_with_stock(
  p_store_key text,
  p_location_gid text DEFAULT NULL
)
RETURNS TABLE(shopify_inventory_item_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sil.inventory_item_id
  FROM shopify_inventory_levels sil
  WHERE sil.store_key = p_store_key
    AND sil.available > 0
    AND (p_location_gid IS NULL OR sil.location_gid = p_location_gid);
$$;
