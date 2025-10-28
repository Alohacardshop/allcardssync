-- Create RPC functions for pre-flight duplicate checks

-- Check for active duplicate shopify_product_id entries
CREATE OR REPLACE FUNCTION public.check_shopify_product_id_dupes()
RETURNS TABLE(
  id uuid,
  sku text,
  shopify_product_id text,
  store_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dupes AS (
    SELECT shopify_product_id
    FROM public.intake_items
    WHERE deleted_at IS NULL 
      AND shopify_product_id IS NOT NULL
    GROUP BY shopify_product_id
    HAVING COUNT(*) > 1
  )
  SELECT i.id, i.sku, i.shopify_product_id, i.store_key
  FROM public.intake_items i
  INNER JOIN dupes d ON d.shopify_product_id = i.shopify_product_id
  WHERE i.deleted_at IS NULL
  ORDER BY i.shopify_product_id, i.created_at;
$$;

-- Check for active duplicate (store_key, sku) entries for Raw items
CREATE OR REPLACE FUNCTION public.check_sku_dupes()
RETURNS TABLE(
  id uuid,
  sku text,
  shopify_product_id text,
  store_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dupes AS (
    SELECT store_key, sku
    FROM public.intake_items
    WHERE deleted_at IS NULL 
      AND sku IS NOT NULL
      AND type = 'Raw'
    GROUP BY store_key, sku
    HAVING COUNT(*) > 1
  )
  SELECT i.id, i.sku, i.shopify_product_id, i.store_key
  FROM public.intake_items i
  INNER JOIN dupes d ON d.store_key = i.store_key AND d.sku = i.sku
  WHERE i.deleted_at IS NULL
    AND i.type = 'Raw'
  ORDER BY i.store_key, i.sku, i.created_at;
$$;