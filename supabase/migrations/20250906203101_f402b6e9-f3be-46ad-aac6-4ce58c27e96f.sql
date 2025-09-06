-- Fix the ambiguous ID issue in create_raw_intake_item function
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer,
  brand_title_in text,
  subject_in text,
  category_in text,
  variant_in text,
  card_number_in text,
  grade_in text,
  price_in numeric,
  cost_in numeric,
  sku_in text,
  source_provider_in text DEFAULT 'manual'::text,
  catalog_snapshot_in jsonb DEFAULT NULL::jsonb,
  pricing_snapshot_in jsonb DEFAULT NULL::jsonb,
  processing_notes_in text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, lot_number text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_lot text;
  v_created timestamptz;
  v_lot_id uuid;
  v_lot_num text;
BEGIN
  -- Access check (named args + trim)
  IF NOT public.user_can_access_store_location(
       _user_id      := auth.uid(),
       _store_key    := btrim(store_key_in),
       _location_gid := btrim(shopify_location_gid_in)
     )
  THEN
    RAISE EXCEPTION 'Access denied: you are not assigned to this store/location'
      USING errcode = '42501';
  END IF;

  -- Find or create the active lot for this user/store/location
  SELECT lot.id, lot.lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(btrim(store_key_in), btrim(shopify_location_gid_in)) AS lot(id, lot_number);

  -- Insert item explicitly into that lot
  INSERT INTO public.intake_items (
    store_key,
    shopify_location_gid,
    quantity,
    brand_title,
    subject,
    category,
    variant,
    card_number,
    grade,
    price,
    cost,
    sku,
    source_provider,
    catalog_snapshot,
    pricing_snapshot,
    processing_notes,
    unique_item_uid,
    created_by,
    lot_id,
    lot_number
  )
  VALUES (
    btrim(store_key_in),
    btrim(shopify_location_gid_in),
    greatest(1, coalesce(quantity_in, 1)),
    brand_title_in,
    subject_in,
    category_in,
    variant_in,
    card_number_in,
    grade_in,
    coalesce(price_in, 0),
    cost_in,
    sku_in,
    coalesce(source_provider_in, 'manual'),
    catalog_snapshot_in,
    pricing_snapshot_in,
    processing_notes_in,
    gen_random_uuid(),
    auth.uid(),
    v_lot_id,
    v_lot_num
  )
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  RETURN QUERY SELECT v_id, v_lot, v_created;
END;
$function$;