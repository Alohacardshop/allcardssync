
-- 1) Trigger function to auto-close lot when it becomes empty and auto-start a new lot

CREATE OR REPLACE FUNCTION public.close_lot_if_empty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot_id uuid;
  v_remaining integer;
  v_store_key text;
  v_location_gid text;
BEGIN
  -- Identify the lot we are affecting
  v_lot_id := COALESCE(NEW.lot_id, OLD.lot_id);

  IF v_lot_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count remaining "active" items in this lot
  SELECT COUNT(*)
    INTO v_remaining
  FROM public.intake_items
  WHERE lot_id = v_lot_id
    AND deleted_at IS NULL
    AND removed_from_batch_at IS NULL;

  -- If no active items remain, close the lot (only if it was still active)
  IF v_remaining = 0 THEN
    -- Capture store/location for later (after update is fine as keys don't change)
    SELECT store_key, shopify_location_gid
      INTO v_store_key, v_location_gid
    FROM public.intake_lots
    WHERE id = v_lot_id;

    UPDATE public.intake_lots
       SET status = 'closed',
           notes = COALESCE(notes, '') ||
                   CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                   'Auto-closed (empty) at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
           updated_at = now()
     WHERE id = v_lot_id
       AND status = 'active';

    -- Only create a new lot if we actually closed this one in this invocation
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
$$;

-- 2) Replace the trigger to use the new function
DROP TRIGGER IF EXISTS trg_close_lot_if_empty ON public.intake_items;

CREATE TRIGGER trg_close_lot_if_empty
AFTER UPDATE OR DELETE ON public.intake_items
FOR EACH ROW
EXECUTE FUNCTION public.close_lot_if_empty();
