-- Function to close empty lots and create new ones
CREATE OR REPLACE FUNCTION public.close_empty_lot_and_create_new(_store_key text, _location_gid text)
 RETURNS TABLE(old_lot_id uuid, old_lot_number text, new_lot_id uuid, new_lot_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_lot_id uuid;
  v_old_lot_number text;
  v_new_lot_id uuid;
  v_new_lot_number text;
  v_remaining_items integer;
BEGIN
  -- Find the current active lot for this user/store/location
  SELECT l.id, l.lot_number
    INTO v_old_lot_id, v_old_lot_number
  FROM public.intake_lots l
  WHERE l.status = 'active'
    AND COALESCE(l.store_key, '') = COALESCE(btrim(_store_key), '')
    AND COALESCE(public._norm_gid(l.shopify_location_gid), '') = COALESCE(public._norm_gid(_location_gid), '')
    AND (l.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- Check if lot exists and how many active items remain
  IF v_old_lot_id IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_remaining_items
    FROM public.intake_items
    WHERE lot_id = v_old_lot_id
      AND deleted_at IS NULL
      AND removed_from_batch_at IS NULL;

    -- Only close if lot is empty
    IF v_remaining_items = 0 THEN
      UPDATE public.intake_lots
         SET status = 'closed',
             notes = COALESCE(notes, '') || 
                    CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                    'Auto-closed (empty) at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
             updated_at = now()
       WHERE id = v_old_lot_id;
    ELSE
      -- Lot not empty, return current lot info
      RETURN QUERY SELECT v_old_lot_id, v_old_lot_number, v_old_lot_id, v_old_lot_number;
      RETURN;
    END IF;
  END IF;

  -- Create new lot
  INSERT INTO public.intake_lots (
    store_key, shopify_location_gid, lot_type, total_items, total_value, status, created_by, created_at, updated_at
  )
  VALUES (
    btrim(_store_key), btrim(_location_gid), 'mixed', 0, 0, 'active', auth.uid(), now(), now()
  )
  RETURNING id, lot_number INTO v_new_lot_id, v_new_lot_number;

  RETURN QUERY SELECT v_old_lot_id, v_old_lot_number, v_new_lot_id, v_new_lot_number;
END;
$function$;

-- Function to manually start a new lot (closes current lot regardless of item count)
CREATE OR REPLACE FUNCTION public.force_new_lot(_store_key text, _location_gid text, _reason text DEFAULT 'Manual new lot')
 RETURNS TABLE(old_lot_id uuid, old_lot_number text, new_lot_id uuid, new_lot_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_lot_id uuid;
  v_old_lot_number text;
  v_new_lot_id uuid;
  v_new_lot_number text;
BEGIN
  -- Find the current active lot for this user/store/location
  SELECT l.id, l.lot_number
    INTO v_old_lot_id, v_old_lot_number
  FROM public.intake_lots l
  WHERE l.status = 'active'
    AND COALESCE(l.store_key, '') = COALESCE(btrim(_store_key), '')
    AND COALESCE(public._norm_gid(l.shopify_location_gid), '') = COALESCE(public._norm_gid(_location_gid), '')
    AND (l.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- Close current lot if it exists
  IF v_old_lot_id IS NOT NULL THEN
    UPDATE public.intake_lots
       SET status = 'closed',
           notes = COALESCE(notes, '') || 
                  CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                  'Manually closed at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || 
                  CASE WHEN _reason IS NOT NULL AND length(_reason) > 0
                       THEN ': ' || _reason ELSE '' END,
           updated_at = now()
     WHERE id = v_old_lot_id;
  END IF;

  -- Create new lot
  INSERT INTO public.intake_lots (
    store_key, shopify_location_gid, lot_type, total_items, total_value, status, created_by, created_at, updated_at
  )
  VALUES (
    btrim(_store_key), btrim(_location_gid), 'mixed', 0, 0, 'active', auth.uid(), now(), now()
  )
  RETURNING id, lot_number INTO v_new_lot_id, v_new_lot_number;

  RETURN QUERY SELECT v_old_lot_id, v_old_lot_number, v_new_lot_id, v_new_lot_number;
END;
$function$;