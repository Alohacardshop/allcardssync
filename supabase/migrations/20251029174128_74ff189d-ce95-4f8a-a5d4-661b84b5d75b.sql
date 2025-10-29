-- Simplify trigger_shopify_queue_sync to avoid updated_by field access issues
DROP FUNCTION IF EXISTS public.trigger_shopify_queue_sync() CASCADE;

CREATE OR REPLACE FUNCTION public.trigger_shopify_queue_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Skip if this update came from the queue processor itself to avoid loops
  -- Only process items that have been sent to inventory (removed_from_batch_at is set)
  IF TG_OP != 'DELETE' AND NEW.removed_from_batch_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- For items being sent to inventory (removed_from_batch_at is set)
  -- Or items being deleted, add them to the sync queue
  IF TG_OP = 'UPDATE' AND OLD.removed_from_batch_at IS NULL AND NEW.removed_from_batch_at IS NOT NULL THEN
    -- Item is being sent to inventory
    INSERT INTO public.shopify_sync_queue (
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
    )
    ON CONFLICT (inventory_item_id) WHERE status IN ('queued', 'processing')
    DO UPDATE SET
      action = CASE WHEN NEW.shopify_product_id IS NOT NULL THEN 'update' ELSE 'create' END,
      updated_at = now();
      
  ELSIF TG_OP = 'DELETE' AND OLD.shopify_product_id IS NOT NULL THEN
    -- Item is being deleted and has a Shopify product
    INSERT INTO public.shopify_sync_queue (
      inventory_item_id,
      action,
      status,
      retry_count,
      max_retries
    ) VALUES (
      OLD.id,
      'delete',
      'queued',
      0,
      3
    )
    ON CONFLICT (inventory_item_id) WHERE status IN ('queued', 'processing')
    DO NOTHING;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Recreate the trigger to use the updated function
DROP TRIGGER IF EXISTS trigger_inventory_shopify_queue_sync ON public.intake_items;

CREATE TRIGGER trigger_inventory_shopify_queue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW 
  EXECUTE FUNCTION public.trigger_shopify_queue_sync();