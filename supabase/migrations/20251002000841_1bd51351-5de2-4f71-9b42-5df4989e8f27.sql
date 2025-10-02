-- Prevent duplicate Shopify sync queue entries

-- 1. Add unique index to prevent duplicate active queue entries for same item
-- This prevents race conditions where the trigger fires multiple times
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_sync_queue_unique_active 
ON public.shopify_sync_queue (inventory_item_id, action) 
WHERE status IN ('queued', 'processing');

-- 2. Update the trigger function to check for existing queue entries before inserting
CREATE OR REPLACE FUNCTION public.trigger_inventory_shopify_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_excluded_item boolean := false;
BEGIN
  -- Only process items that are already in inventory (removed_from_batch_at is not null)
  -- Skip if updated by webhook to prevent loops
  IF TG_OP != 'DELETE' AND (NEW.removed_from_batch_at IS NULL OR NEW.updated_by = 'shopify_webhook') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check if automatic sync is enabled
  IF NOT public.is_inventory_sync_enabled() THEN
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
  IF tg_op = 'DELETE' THEN
    v_excluded_item := old.variant = 'Bulk' OR 
                       old.variant = 'Other' OR
                       (old.catalog_snapshot IS NOT NULL AND 
                        (old.catalog_snapshot->>'type' = 'card_bulk' OR
                         old.catalog_snapshot->>'type' = 'other_item'));
  ELSE
    v_excluded_item := new.variant = 'Bulk' OR 
                       new.variant = 'Other' OR
                       (new.catalog_snapshot IS NOT NULL AND 
                        (new.catalog_snapshot->>'type' = 'card_bulk' OR
                         new.catalog_snapshot->>'type' = 'other_item'));
  END IF;

  IF v_excluded_item THEN
    IF tg_op = 'DELETE' THEN
      RETURN old;
    ELSE
      RETURN new;
    END IF;
  END IF;

  -- Determine action
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.quantity = 0 AND OLD.quantity > 0) THEN
    v_action := 'delete';
  ELSIF TG_OP = 'UPDATE' AND NEW.removed_from_batch_at IS NOT NULL THEN
    v_action := CASE WHEN COALESCE(NEW.shopify_product_id, '') != '' THEN 'update' ELSE 'create' END;
  ELSE
    -- No action needed
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- CRITICAL: Check if there's already an active queue entry for this item+action
  -- This prevents duplicate entries from rapid trigger fires
  IF NOT EXISTS (
    SELECT 1 
    FROM public.shopify_sync_queue 
    WHERE inventory_item_id = COALESCE(NEW.id, OLD.id)
      AND action = v_action
      AND status IN ('queued', 'processing')
  ) THEN
    -- No existing entry, safe to insert
    INSERT INTO public.shopify_sync_queue (
      inventory_item_id,
      action,
      status
    ) VALUES (
      COALESCE(NEW.id, OLD.id),
      v_action,
      'queued'
    );
  ELSE
    -- Already queued or processing, skip to prevent duplicate
    RAISE LOG 'Skipping duplicate sync queue entry for item % action %', COALESCE(NEW.id, OLD.id), v_action;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Add logging for sync operations
COMMENT ON FUNCTION public.trigger_inventory_shopify_sync() IS 
'Triggers Shopify sync for inventory items. Includes duplicate prevention to avoid race conditions.';

-- 4. Clean up any existing duplicate queue entries (keep oldest for each item+action)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY inventory_item_id, action, status 
           ORDER BY created_at ASC
         ) as rn
  FROM public.shopify_sync_queue
  WHERE status IN ('queued', 'processing')
)
DELETE FROM public.shopify_sync_queue
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);