-- Configure default Shopify sync settings for optimal performance and safety
INSERT INTO public.system_settings (key_name, key_value, description, category) VALUES
('SHOPIFY_BATCH_SIZE', '1', 'Number of items processed per batch (recommended: 1 for safety)', 'shopify'),
('SHOPIFY_BATCH_DELAY', '2000', 'Delay between batches in milliseconds (2 seconds to avoid rate limits)', 'shopify'),
('SHOPIFY_MAX_PROCESS_COUNT', '50', 'Maximum items to process per run (prevents runaway processing)', 'shopify'),
('SHOPIFY_AUTO_CLEANUP_DAYS', '7', 'Days after which completed queue items are automatically deleted', 'shopify'),
('SHOPIFY_AUTO_ARCHIVE_DAYS', '30', 'Days after which failed items are archived with [ARCHIVED] tag', 'shopify'),
('SHOPIFY_HEALTH_CHECK_INTERVAL', '10', 'Minutes between queue health checks', 'shopify'),
('SHOPIFY_EMAIL_ALERTS', 'false', 'Enable email notifications for critical queue issues', 'shopify'),
('SHOPIFY_FAILURE_THRESHOLD', '10', 'Percentage failure rate that triggers health alerts', 'shopify')
ON CONFLICT (key_name) DO UPDATE SET
  key_value = EXCLUDED.key_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = now();

-- Add trigger to automatically queue inventory items for Shopify sync
-- This replaces the old shopify sync trigger with the new queue-based system
CREATE OR REPLACE FUNCTION trigger_shopify_queue_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process items that are already in inventory (removed_from_batch_at is not null)
  -- Skip if updated by webhook to prevent loops
  IF TG_OP != 'DELETE' AND (NEW.removed_from_batch_at IS NULL OR NEW.updated_by = 'shopify_webhook') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip sync for sold items (quantity = 0 and sold_at is set)
  IF TG_OP != 'DELETE' AND NEW.quantity = 0 AND NEW.sold_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if item should be excluded from Shopify sync (bulk cards and other items)
  DECLARE
    is_excluded_item boolean := false;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      is_excluded_item := OLD.variant = 'Bulk' OR 
                         OLD.variant = 'Other' OR
                         (OLD.catalog_snapshot IS NOT NULL AND 
                          (OLD.catalog_snapshot->>'type' = 'card_bulk' OR
                           OLD.catalog_snapshot->>'type' = 'other_item'));
    ELSE
      is_excluded_item := NEW.variant = 'Bulk' OR 
                         NEW.variant = 'Other' OR
                         (NEW.catalog_snapshot IS NOT NULL AND 
                          (NEW.catalog_snapshot->>'type' = 'card_bulk' OR
                           NEW.catalog_snapshot->>'type' = 'other_item'));
    END IF;

    -- Skip Shopify sync for excluded items
    IF is_excluded_item THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END;

  -- Queue for Shopify sync based on the operation type
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.quantity = 0 AND OLD.quantity > 0) THEN
    -- Queue for deletion from Shopify if it has a product ID
    IF COALESCE(OLD.shopify_product_id, '') != '' THEN
      INSERT INTO public.shopify_sync_queue (
        inventory_item_id,
        action,
        status
      ) VALUES (
        OLD.id,
        'delete',
        'queued'
      );
    END IF;
  
  ELSIF TG_OP = 'UPDATE' AND NEW.removed_from_batch_at IS NOT NULL THEN
    -- Skip if no significant changes that would affect Shopify
    IF (OLD.quantity IS NOT DISTINCT FROM NEW.quantity) AND
       (OLD.price IS NOT DISTINCT FROM NEW.price) AND
       (OLD.brand_title IS NOT DISTINCT FROM NEW.brand_title) AND
       (OLD.subject IS NOT DISTINCT FROM NEW.subject) THEN
      RETURN NEW;
    END IF;
    
    -- Queue for update if it has a product ID, otherwise queue for creation
    INSERT INTO public.shopify_sync_queue (
      inventory_item_id,
      action,
      status
    ) VALUES (
      NEW.id,
      CASE WHEN COALESCE(NEW.shopify_product_id, '') != '' THEN 'update' ELSE 'create' END,
      'queued'
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Replace the old trigger with the new queue-based trigger
DROP TRIGGER IF EXISTS trigger_inventory_shopify_sync ON public.intake_items;
CREATE TRIGGER trigger_inventory_shopify_queue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION trigger_shopify_queue_sync();

-- Create indexes for better performance on the sync queue
CREATE INDEX IF NOT EXISTS idx_shopify_sync_queue_status_created 
  ON public.shopify_sync_queue(status, created_at);
  
CREATE INDEX IF NOT EXISTS idx_shopify_sync_queue_inventory_item 
  ON public.shopify_sync_queue(inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_shopify_sync_queue_action_status 
  ON public.shopify_sync_queue(action, status);

-- Add a cleanup function that can be run periodically
CREATE OR REPLACE FUNCTION cleanup_shopify_sync_queue()
RETURNS void AS $$
DECLARE
  cleanup_days integer;
  archive_days integer;
BEGIN
  -- Get cleanup settings
  SELECT 
    COALESCE((SELECT key_value FROM system_settings WHERE key_name = 'SHOPIFY_AUTO_CLEANUP_DAYS'), '7')::integer,
    COALESCE((SELECT key_value FROM system_settings WHERE key_name = 'SHOPIFY_AUTO_ARCHIVE_DAYS'), '30')::integer
  INTO cleanup_days, archive_days;

  -- Delete completed items older than cleanup_days
  DELETE FROM shopify_sync_queue 
  WHERE status = 'completed' 
    AND completed_at < (now() - (cleanup_days || ' days')::interval);

  -- Archive (mark as archived) failed items older than archive_days
  UPDATE shopify_sync_queue 
  SET error_message = COALESCE(error_message, '') || ' [ARCHIVED]'
  WHERE status = 'failed' 
    AND created_at < (now() - (archive_days || ' days')::interval)
    AND error_message NOT LIKE '%[ARCHIVED]%';

  -- Log cleanup activity
  INSERT INTO system_logs (level, message, context)
  VALUES (
    'info',
    'Automatic queue cleanup completed',
    jsonb_build_object(
      'cleanup_days', cleanup_days,
      'archive_days', archive_days,
      'timestamp', now()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;