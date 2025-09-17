-- Re-enable automatic Shopify sync queueing when items are sent to inventory
CREATE OR REPLACE FUNCTION public.trigger_inventory_shopify_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only process items that are already in inventory (removed_from_batch_at is not null)
  -- Skip if updated by webhook to prevent loops
  IF TG_OP != 'DELETE' AND (NEW.removed_from_batch_at IS NULL OR NEW.updated_by = 'shopify_webhook') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check if automatic sync is enabled
  IF NOT public.is_inventory_sync_enabled() THEN
    -- In manual mode, just return without syncing
    IF tg_op = 'DELETE' THEN
      RETURN old;
    ELSE
      RETURN new;
    END IF;
  END IF;

  -- Skip sync for sold items (quantity = 0 and sold_at is set)
  IF tg_op != 'DELETE' AND new.quantity = 0 AND new.sold_at IS NOT NULL THEN
    RETURN new;
  END IF;

  -- Check if item should be excluded from Shopify sync (bulk cards and other items)
  DECLARE
    is_excluded_item boolean := false;
  BEGIN
    IF tg_op = 'DELETE' THEN
      is_excluded_item := old.variant = 'Bulk' OR 
                         old.variant = 'Other' OR
                         (old.catalog_snapshot IS NOT NULL AND 
                          (old.catalog_snapshot->>'type' = 'card_bulk' OR
                           old.catalog_snapshot->>'type' = 'other_item'));
    ELSE
      is_excluded_item := new.variant = 'Bulk' OR 
                         new.variant = 'Other' OR
                         (new.catalog_snapshot IS NOT NULL AND 
                          (new.catalog_snapshot->>'type' = 'card_bulk' OR
                           new.catalog_snapshot->>'type' = 'other_item'));
    END IF;

    -- Skip Shopify sync for excluded items (bulk cards and other items)
    IF is_excluded_item THEN
      IF tg_op = 'DELETE' THEN
        RETURN old;
      ELSE
        RETURN new;
      END IF;
    END IF;
  END;

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
  
  -- For UPDATE operations on active inventory items (items being sent to inventory)
  ELSIF TG_OP = 'UPDATE' AND NEW.removed_from_batch_at IS NOT NULL THEN
    -- Queue for creation if it doesn't have a product ID, otherwise queue for update
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
$$;