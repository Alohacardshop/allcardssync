-- Fix upsert_shopify_intake_item to include SET search_path = public
-- This ensures the ON CONFLICT clause properly resolves the unique constraint

CREATE OR REPLACE FUNCTION public.upsert_shopify_intake_item(
  p_sku text,
  p_store_key text,
  p_shopify_location_gid text,
  p_shopify_product_id text,
  p_shopify_variant_id text,
  p_shopify_inventory_item_id text,
  p_quantity integer,
  p_price numeric,
  p_brand_title text,
  p_subject text,
  p_category text,
  p_image_urls jsonb,
  p_source_provider text,
  p_shopify_snapshot jsonb,
  p_removed_from_batch_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.intake_items (
    sku,
    store_key,
    shopify_location_gid,
    shopify_product_id,
    shopify_variant_id,
    shopify_inventory_item_id,
    quantity,
    price,
    brand_title,
    subject,
    category,
    image_urls,
    source_provider,
    shopify_snapshot,
    removed_from_batch_at,
    updated_at
  ) VALUES (
    p_sku,
    p_store_key,
    p_shopify_location_gid,
    p_shopify_product_id,
    p_shopify_variant_id,
    p_shopify_inventory_item_id,
    p_quantity,
    p_price,
    p_brand_title,
    p_subject,
    p_category,
    p_image_urls,
    p_source_provider,
    p_shopify_snapshot,
    p_removed_from_batch_at,
    NOW()
  )
  ON CONFLICT (store_key, sku, shopify_location_gid)
  DO UPDATE SET
    shopify_product_id = EXCLUDED.shopify_product_id,
    shopify_variant_id = EXCLUDED.shopify_variant_id,
    shopify_inventory_item_id = EXCLUDED.shopify_inventory_item_id,
    quantity = EXCLUDED.quantity,
    price = EXCLUDED.price,
    brand_title = EXCLUDED.brand_title,
    subject = EXCLUDED.subject,
    category = EXCLUDED.category,
    image_urls = EXCLUDED.image_urls,
    source_provider = EXCLUDED.source_provider,
    shopify_snapshot = EXCLUDED.shopify_snapshot,
    removed_from_batch_at = EXCLUDED.removed_from_batch_at,
    updated_at = NOW();
END;
$function$;