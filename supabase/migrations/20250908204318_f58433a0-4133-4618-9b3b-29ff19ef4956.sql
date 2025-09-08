-- Fix ambiguous column reference 'id' in get_or_create_active_lot function
CREATE OR REPLACE FUNCTION public.get_or_create_active_lot(_store_key text, _location_gid text)
 RETURNS TABLE(id uuid, lot_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_lot text;
BEGIN
  -- Find latest active lot for this user at the selected store/location
  -- Fix: Explicitly qualify the id column reference to avoid ambiguity
  SELECT l.id, l.lot_number
    INTO v_id, v_lot
  FROM public.intake_lots l
  WHERE l.status = 'active'
    AND COALESCE(l.store_key, '') = COALESCE(btrim(_store_key), '')
    AND COALESCE(public._norm_gid(l.shopify_location_gid), '') = COALESCE(public._norm_gid(_location_gid), '')
    AND (l.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- If none, create a new one
  IF v_id IS NULL THEN
    INSERT INTO public.intake_lots (
      store_key, shopify_location_gid, lot_type, total_items, total_value, status, created_by, created_at, updated_at
    )
    VALUES (
      btrim(_store_key), btrim(_location_gid), 'mixed', 0, 0, 'active', auth.uid(), now(), now()
    )
    RETURNING intake_lots.id, intake_lots.lot_number INTO v_id, v_lot;
  END IF;

  RETURN QUERY SELECT v_id, v_lot;
END;
$function$;