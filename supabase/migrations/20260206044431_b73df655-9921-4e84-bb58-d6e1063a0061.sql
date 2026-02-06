-- Fix remaining items that have shopify_product_id but still show as pending
-- These are items that were synced to Shopify but status wasn't updated
UPDATE intake_items
SET shopify_sync_status = 'synced',
    last_shopify_synced_at = COALESCE(last_shopify_synced_at, NOW())
WHERE shopify_product_id IS NOT NULL
  AND (shopify_sync_status = 'pending' OR shopify_sync_status IS NULL);

-- Also clear any items stuck in error/failed that have valid product IDs
UPDATE intake_items
SET shopify_sync_status = 'synced',
    last_shopify_sync_error = NULL
WHERE shopify_product_id IS NOT NULL
  AND shopify_sync_status IN ('error', 'failed');