-- Clean up orphaned removal_pending item (SKU 95614274, no product ID, not deleted)
UPDATE intake_items 
SET shopify_sync_status = 'pending' 
WHERE id = 'daa69b63-03e6-489d-9b66-51183e4b4628' 
  AND shopify_sync_status = 'removal_pending' 
  AND deleted_at IS NULL 
  AND shopify_product_id IS NULL;