-- Create trigger to update the shopify_sync_queue when inventory items are updated or deleted

-- Function to handle inventory item changes and queue for Shopify sync
CREATE OR REPLACE FUNCTION public.trigger_inventory_shopify_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process items that are already in inventory (removed_from_batch_at is not null)
  -- Skip if updated by webhook to prevent loops
  IF TG_OP != 'DELETE' AND (NEW.removed_from_batch_at IS NULL OR NEW.updated_by = 'shopify_webhook') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- For DELETE operations or when quantity goes to 0
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
  
  -- For UPDATE operations on active inventory items
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
$function$;

-- Create trigger on intake_items for inventory sync
DROP TRIGGER IF EXISTS trigger_inventory_shopify_sync ON public.intake_items;
CREATE TRIGGER trigger_inventory_shopify_sync
  AFTER UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_inventory_shopify_sync();