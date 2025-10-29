-- Recompile all trigger functions on public.intake_items to bind NEW row type with updated_by column
-- This forces PostgreSQL to re-parse the row type and recognize the newly added updated_by field

-- Trigger: snapshot_intake_items → create_intake_item_snapshot()
-- References: NEW.id, NEW.created_by, NEW.updated_by (CRITICAL - this one fails)
CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  snapshot_creator uuid;
BEGIN
  -- Determine who created this snapshot
  -- For INSERT: use created_by
  -- For UPDATE: use updated_by if available, otherwise created_by
  -- For DELETE: use created_by
  IF TG_OP = 'INSERT' THEN
    snapshot_creator := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    snapshot_creator := COALESCE(
      NULLIF(NEW.updated_by, '')::uuid,  -- Try to cast updated_by from text to uuid
      NEW.created_by                      -- Fall back to created_by
    );
  ELSE  -- DELETE
    snapshot_creator := OLD.created_by;
  END IF;

  -- Create the snapshot
  INSERT INTO public.item_snapshots (
    intake_item_id,
    snapshot_type,
    snapshot_data,
    created_by,
    metadata
  )
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP::text,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END,
    snapshot_creator,
    jsonb_build_object(
      'trigger_time', NOW(),
      'operation', TG_OP
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger: trg_intake_items_set_timestamp → update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Trigger: trg_prevent_non_admin_soft_delete → prevent_non_admin_soft_delete()
CREATE OR REPLACE FUNCTION public.prevent_non_admin_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL
     AND (OLD.deleted_at IS NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    IF public.has_role(auth.uid(), 'admin'::app_role) THEN
      RETURN NEW;
    END IF;
    IF public.can_delete_batch_item(COALESCE(NEW.id, OLD.id)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only admins or the current batch owner can delete items not yet in inventory';
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger: trg_close_lot_if_empty → close_lot_if_empty()
CREATE OR REPLACE FUNCTION public.close_lot_if_empty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lot_id uuid;
  v_remaining integer;
  v_store_key text;
  v_location_gid text;
BEGIN
  v_lot_id := COALESCE(NEW.lot_id, OLD.lot_id);
  IF v_lot_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.intake_items
  WHERE lot_id = v_lot_id
    AND deleted_at IS NULL
    AND removed_from_batch_at IS NULL;

  IF v_remaining = 0 THEN
    SELECT store_key, shopify_location_gid INTO v_store_key, v_location_gid
    FROM public.intake_lots WHERE id = v_lot_id;

    UPDATE public.intake_lots
       SET status = 'closed',
           notes = COALESCE(notes, '') ||
                   CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                   'Auto-closed (empty) at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
           updated_at = now()
     WHERE id = v_lot_id AND status = 'active';

    IF FOUND AND v_store_key IS NOT NULL AND v_location_gid IS NOT NULL AND auth.uid() IS NOT NULL THEN
      INSERT INTO public.intake_lots (
        store_key, shopify_location_gid, lot_type, total_items, total_value,
        status, created_by, created_at, updated_at
      ) VALUES (
        btrim(v_store_key), btrim(v_location_gid), 'mixed', 0, 0,
        'active', auth.uid(), now(), now()
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger: trigger_auto_shopify_removal → trigger_shopify_item_removal()
CREATE OR REPLACE FUNCTION public.trigger_shopify_item_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_type text;
BEGIN
  IF TG_OP = 'UPDATE' 
     AND OLD.deleted_at IS NULL 
     AND NEW.deleted_at IS NOT NULL
     AND NEW.store_key IS NOT NULL
     AND (NEW.shopify_product_id IS NOT NULL OR NEW.sku IS NOT NULL)
  THEN
    item_type := NEW.type;
    IF item_type IS NULL OR item_type = '' THEN
      IF NEW.psa_cert IS NOT NULL AND NEW.psa_cert != '' THEN
        item_type := 'Graded';
      ELSIF NEW.grade IS NOT NULL AND NEW.grade != '' AND NEW.grade != '0' THEN
        item_type := 'Graded';
      ELSE
        item_type := 'Raw';
      END IF;
    END IF;
    
    UPDATE public.intake_items 
    SET shopify_removal_mode = 
        CASE 
          WHEN item_type = 'Graded' THEN 'delete_product'
          WHEN item_type = 'Raw' THEN 'reduce_quantity'
          ELSE 'unknown'
        END,
        shopify_sync_status = 'removal_pending',
        updated_at = now()
    WHERE id = NEW.id;
    
    INSERT INTO public.system_logs (level, message, context)
    VALUES (
      'info',
      'Item marked for Shopify removal',
      jsonb_build_object(
        'item_id', NEW.id,
        'item_type', item_type,
        'removal_mode', CASE 
          WHEN item_type = 'Graded' THEN 'delete_product'
          WHEN item_type = 'Raw' THEN 'reduce_quantity'
          ELSE 'unknown'
        END,
        'sku', NEW.sku,
        'shopify_product_id', NEW.shopify_product_id
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger: trigger_inventory_shopify_queue_sync → trigger_shopify_queue_sync()
CREATE OR REPLACE FUNCTION public.trigger_shopify_queue_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Trigger: update_lot_totals_trigger → update_lot_totals()
CREATE OR REPLACE FUNCTION public.update_lot_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_items integer;
  v_total_value numeric;
BEGIN
  SELECT 
    COUNT(*),
    COALESCE(SUM(price * quantity), 0)
  INTO v_total_items, v_total_value
  FROM public.intake_items
  WHERE lot_id = COALESCE(NEW.lot_id, OLD.lot_id)
    AND deleted_at IS NULL
    AND removed_from_batch_at IS NULL;

  UPDATE public.intake_lots
  SET 
    total_items = v_total_items,
    total_value = v_total_value,
    updated_at = now()
  WHERE id = COALESCE(NEW.lot_id, OLD.lot_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger: ensure_lot_exists_trigger → ensure_lot_exists()
CREATE OR REPLACE FUNCTION public.ensure_lot_exists()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.intake_lots WHERE lot_number = NEW.lot_number) THEN
    INSERT INTO public.intake_lots (
      id, lot_number, lot_type, total_items, total_value, status,
      store_key, shopify_location_gid, created_by, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), NEW.lot_number, 'mixed', 0, 0, 'active',
      NEW.store_key, NEW.shopify_location_gid, auth.uid(), now(), now()
    );
  END IF;
  
  IF NEW.lot_id IS NULL THEN
    NEW.lot_id := (SELECT id FROM public.intake_lots WHERE lot_number = NEW.lot_number);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Trigger: validate_item_lot_owner_trigger → validate_item_lot_owner()
CREATE OR REPLACE FUNCTION public.validate_item_lot_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.intake_lots
    WHERE id = NEW.lot_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only add items to your own lots';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger: trg_intake_items_price_default → set_intake_price_default()
CREATE OR REPLACE FUNCTION public.set_intake_price_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.price IS NULL THEN
    NEW.price := 99999.00;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger: auto_queue_shopify_sync → auto_queue_for_shopify_sync()
CREATE OR REPLACE FUNCTION public.auto_queue_for_shopify_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;