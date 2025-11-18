-- Create a function to handle shopify product upserts with proper conflict resolution
CREATE OR REPLACE FUNCTION upsert_shopify_intake_item(
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
RETURNS VOID AS $$
BEGIN
  INSERT INTO intake_items (
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
$$ LANGUAGE plpgsql SECURITY DEFINER;