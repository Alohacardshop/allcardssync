-- Update create_raw_intake_item RPC to accept category parameters
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer DEFAULT 1,
  brand_title_in text DEFAULT ''::text,
  subject_in text DEFAULT ''::text,
  category_in text DEFAULT ''::text,
  variant_in text DEFAULT ''::text,
  card_number_in text DEFAULT ''::text,
  grade_in text DEFAULT ''::text,
  price_in numeric DEFAULT 0,
  cost_in numeric DEFAULT NULL::numeric,
  sku_in text DEFAULT ''::text,
  source_provider_in text DEFAULT 'manual'::text,
  catalog_snapshot_in jsonb DEFAULT NULL::jsonb,
  pricing_snapshot_in jsonb DEFAULT NULL::jsonb,
  processing_notes_in text DEFAULT NULL::text,
  main_category_in text DEFAULT NULL::text,
  sub_category_in text DEFAULT NULL::text
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
  v_item_type text;
  v_image_urls jsonb;
  v_psa_cert text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Log the creation attempt
  RAISE LOG '[create_raw_intake_item] Starting creation for user=% store=% location=%', 
    v_user_id, btrim(store_key_in), btrim(shopify_location_gid_in);

  -- Access check (named args + trim)
  IF NOT public.user_can_access_store_location(
       _user_id      := v_user_id,
       _store_key    := btrim(store_key_in),
       _location_gid := btrim(shopify_location_gid_in)
     )
  THEN
    RAISE EXCEPTION 'Access denied: you are not assigned to this store/location'
      USING errcode = '42501';
  END IF;

  -- Determine item type based on grade
  IF grade_in IS NOT NULL AND grade_in != '' AND grade_in != '0' THEN
    v_item_type := 'Graded';
  ELSE
    v_item_type := 'Raw';
  END IF;

  -- Extract image URLs from catalog snapshot
  v_image_urls := NULL;
  IF catalog_snapshot_in IS NOT NULL THEN
    IF catalog_snapshot_in ? 'imageUrls' AND jsonb_typeof(catalog_snapshot_in->'imageUrls') = 'array' THEN
      v_image_urls := catalog_snapshot_in->'imageUrls';
    ELSIF catalog_snapshot_in ? 'imageUrl' AND catalog_snapshot_in->>'imageUrl' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'imageUrl');
    ELSIF catalog_snapshot_in ? 'image_url' AND catalog_snapshot_in->>'image_url' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'image_url');
    END IF;
  END IF;

  -- Extract PSA cert
  v_psa_cert := NULL;
  IF catalog_snapshot_in IS NOT NULL THEN
    IF catalog_snapshot_in ? 'psa_cert' THEN
      v_psa_cert := catalog_snapshot_in->>'psa_cert';
    ELSIF catalog_snapshot_in ? 'certNumber' THEN
      v_psa_cert := catalog_snapshot_in->>'certNumber';
    END IF;
  END IF;

  -- Find or create the active lot for this user/store/location
  SELECT lot.id, lot.lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(btrim(store_key_in), btrim(shopify_location_gid_in)) AS lot(id, lot_number);

  RAISE LOG '[create_raw_intake_item] Using lot=% (%) for user=%', v_lot_id, v_lot_num, v_user_id;

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
    lot_number,
    type,
    image_urls,
    psa_cert,
    psa_cert_number,
    main_category,
    sub_category
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
    v_user_id,
    v_lot_id,
    v_lot_num,
    v_item_type,
    v_image_urls,
    v_psa_cert,
    v_psa_cert,
    main_category_in,
    sub_category_in
  )
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  RAISE LOG '[create_raw_intake_item] Created item=% in lot=% for user=%', v_id, v_lot, v_user_id;

  RETURN QUERY SELECT v_id, v_lot, v_created;
END;
$function$;