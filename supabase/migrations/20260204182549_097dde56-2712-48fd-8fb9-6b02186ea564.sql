-- Update the upsert_shopify_intake_item function to also set shopify_tags
CREATE OR REPLACE FUNCTION public.upsert_shopify_intake_item(
  p_sku TEXT,
  p_store_key TEXT,
  p_shopify_location_gid TEXT,
  p_shopify_product_id TEXT,
  p_shopify_variant_id TEXT,
  p_shopify_inventory_item_id TEXT,
  p_quantity INTEGER,
  p_price NUMERIC,
  p_brand_title TEXT,
  p_subject TEXT,
  p_category TEXT,
  p_image_urls JSONB,
  p_source_provider TEXT,
  p_shopify_snapshot JSONB,
  p_removed_from_batch_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopify_tags TEXT[];
BEGIN
  -- Extract tags from shopify_snapshot into shopify_tags array
  IF p_shopify_snapshot IS NOT NULL AND p_shopify_snapshot->'tags' IS NOT NULL THEN
    SELECT ARRAY(
      SELECT lower(trim(jsonb_array_elements_text(p_shopify_snapshot->'tags')))
    ) INTO v_shopify_tags;
  ELSE
    v_shopify_tags := NULL;
  END IF;

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
    shopify_tags,
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
    v_shopify_tags,
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
    shopify_tags = EXCLUDED.shopify_tags,
    removed_from_batch_at = EXCLUDED.removed_from_batch_at,
    updated_at = NOW();
END;
$$;