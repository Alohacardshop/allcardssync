
-- Fix function search_path for security hardening
-- Add SET search_path = 'public' to functions missing this security setting

-- 1. Fix _norm_gid function
CREATE OR REPLACE FUNCTION public._norm_gid(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT nullif(btrim(t), '');
$$;

-- 2. Fix trigger_shopify_sync function
CREATE OR REPLACE FUNCTION public.trigger_shopify_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- 3. Fix validate_item_lot_owner function
CREATE OR REPLACE FUNCTION public.validate_item_lot_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  -- Allow if user is admin
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Validate that the user owns the lot they're adding to
  IF NOT EXISTS (
    SELECT 1 FROM public.intake_lots
    WHERE id = NEW.lot_id
    AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only add items to your own lots';
  END IF;

  RETURN NEW;
END;
$function$;
