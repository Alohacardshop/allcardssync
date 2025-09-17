-- Manually queue the pending inventory item for Shopify sync
INSERT INTO public.shopify_sync_queue (inventory_item_id, action, status) 
VALUES ('985d2523-6621-43f6-b3ef-9b4864ae248e', 'create', 'queued');