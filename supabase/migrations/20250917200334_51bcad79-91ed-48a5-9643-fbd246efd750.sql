-- Clear the failing queue item and re-queue it fresh
DELETE FROM shopify_sync_queue WHERE inventory_item_id = '985d2523-6621-43f6-b3ef-9b4864ae248e';

-- Re-queue the inventory item with fresh retry count
INSERT INTO shopify_sync_queue (inventory_item_id, action, status, retry_count, max_retries, queue_position) 
VALUES ('985d2523-6621-43f6-b3ef-9b4864ae248e', 'create', 'queued', 0, 3, 1);