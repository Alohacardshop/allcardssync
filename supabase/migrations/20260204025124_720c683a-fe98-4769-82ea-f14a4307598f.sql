-- Add unique constraint on inventory_item_id to support upsert for duplicate prevention
ALTER TABLE public.ebay_sync_queue 
ADD CONSTRAINT ebay_sync_queue_inventory_item_id_unique UNIQUE (inventory_item_id);