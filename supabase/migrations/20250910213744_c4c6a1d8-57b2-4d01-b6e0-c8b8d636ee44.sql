-- Remove legacy Shopify HTTP calls from trigger
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip if updated by webhook (loop prevention)
  IF TG_OP != 'DELETE' AND NEW.updated_by = 'shopify_webhook' THEN
    RETURN NEW;
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

  -- E) Guardrail: Skip sync for sold items (quantity = 0 and sold_at is set)
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

  -- NO-OP: All Shopify sync now happens via v2 functions called from UI
  -- Legacy HTTP dispatch to shopify-sync-inventory has been removed
  -- Return the record without any external HTTP calls
  
  IF tg_op = 'DELETE' THEN
    RETURN old;
  ELSE
    RETURN new;
  END IF;
END;
$function$;