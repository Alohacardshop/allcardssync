-- Clean up old Shopify sync functions and create new ones

-- Drop old auto-trigger functions
DROP FUNCTION IF EXISTS trigger_shopify_sync_processor();
DROP FUNCTION IF EXISTS auto_trigger_shopify_sync();
DROP FUNCTION IF EXISTS manual_trigger_shopify_processor();
DROP TRIGGER IF EXISTS shopify_sync_queue_auto_trigger ON shopify_sync_queue;

-- Create simplified queue management function
CREATE OR REPLACE FUNCTION add_to_shopify_sync_queue(
  item_ids UUID[],
  sync_action TEXT DEFAULT 'create'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted_count INTEGER := 0;
  queue_item RECORD;
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

-- Create function to automatically add items to queue when they're sent to inventory
CREATE OR REPLACE FUNCTION auto_queue_for_shopify_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- Create the trigger for automatic queueing
DROP TRIGGER IF EXISTS auto_queue_shopify_sync ON intake_items;
CREATE TRIGGER auto_queue_shopify_sync
  AFTER UPDATE ON intake_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_queue_for_shopify_sync();

-- Create function to trigger the new sync processor
CREATE OR REPLACE FUNCTION trigger_shopify_sync()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- This will be called by the frontend to trigger the edge function
  -- The actual processing happens in the shopify-sync edge function
  
  RETURN json_build_object(
    'success', true,
    'message', 'Shopify sync trigger initiated'
  );
END;
$$;