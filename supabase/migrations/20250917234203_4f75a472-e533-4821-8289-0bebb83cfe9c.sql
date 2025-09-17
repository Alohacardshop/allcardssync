-- Fix security warnings by adding search_path to functions

-- Update add_to_shopify_sync_queue function with search_path
CREATE OR REPLACE FUNCTION add_to_shopify_sync_queue(
  item_ids UUID[],
  sync_action TEXT DEFAULT 'create'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  -- Insert items into queue
  FOR i IN 1..array_length(item_ids, 1) LOOP
    INSERT INTO shopify_sync_queue (
      inventory_item_id,
      action,
      status,
      retry_count,
      max_retries
    ) VALUES (
      item_ids[i],
      sync_action,
      'queued',
      0,
      3
    );
    inserted_count := inserted_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'queued_items', inserted_count
  );
END;
$$;

-- Update auto_queue_for_shopify_sync function with search_path
CREATE OR REPLACE FUNCTION auto_queue_for_shopify_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only queue items that are being sent to inventory (removed_from_batch_at is being set)
  IF TG_OP = 'UPDATE' 
     AND OLD.removed_from_batch_at IS NULL 
     AND NEW.removed_from_batch_at IS NOT NULL
     AND NEW.store_key IS NOT NULL
     AND NEW.shopify_location_gid IS NOT NULL
     AND NEW.sku IS NOT NULL
     AND NEW.deleted_at IS NULL -- Not deleted
  THEN
    -- Add to sync queue
    INSERT INTO shopify_sync_queue (
      inventory_item_id,
      action,
      status,
      retry_count,
      max_retries
    ) VALUES (
      NEW.id,
      CASE WHEN NEW.shopify_product_id IS NOT NULL THEN 'update' ELSE 'create' END,
      'queued',
      0,
      3
    );
  END IF;
  
  -- Queue for deletion when item is soft-deleted
  IF TG_OP = 'UPDATE' 
     AND OLD.deleted_at IS NULL 
     AND NEW.deleted_at IS NOT NULL
     AND NEW.shopify_product_id IS NOT NULL
  THEN
    INSERT INTO shopify_sync_queue (
      inventory_item_id,
      action,
      status,
      retry_count,
      max_retries
    ) VALUES (
      NEW.id,
      'delete',
      'queued',
      0,
      3
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update trigger_shopify_sync function with search_path
CREATE OR REPLACE FUNCTION trigger_shopify_sync()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN json_build_object(
    'success', true,
    'message', 'Shopify sync trigger initiated'
  );
END;
$$;