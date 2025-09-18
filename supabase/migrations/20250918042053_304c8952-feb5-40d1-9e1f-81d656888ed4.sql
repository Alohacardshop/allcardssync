-- Update create_raw_intake_item to extract and store image URLs properly
CREATE OR REPLACE FUNCTION create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer DEFAULT 1,
  brand_title_in text DEFAULT '',
  subject_in text DEFAULT '',
  category_in text DEFAULT '',
  variant_in text DEFAULT '',
  card_number_in text DEFAULT '',
  grade_in text DEFAULT '',
  price_in numeric DEFAULT 0,
  cost_in numeric DEFAULT NULL,
  sku_in text DEFAULT '',
  source_provider_in text DEFAULT 'manual',
  catalog_snapshot_in jsonb DEFAULT NULL,
  pricing_snapshot_in jsonb DEFAULT NULL,
  processing_notes_in text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  lot_number text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
  v_lot text;
  v_created timestamptz;
  v_lot_id uuid;
  v_lot_num text;
  v_item_type text;
  v_image_urls jsonb;
  v_psa_cert text;
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

  -- Determine item type based on grade
  IF grade_in IS NOT NULL AND grade_in != '' AND grade_in != '0' THEN
    v_item_type := 'Graded';
  ELSE
    v_item_type := 'Raw';
  END IF;

  -- Extract image URLs from catalog snapshot
  v_image_urls := NULL;
  IF catalog_snapshot_in IS NOT NULL THEN
    -- Try to extract imageUrls array first
    IF catalog_snapshot_in ? 'imageUrls' AND jsonb_typeof(catalog_snapshot_in->'imageUrls') = 'array' THEN
      v_image_urls := catalog_snapshot_in->'imageUrls';
    -- Try single imageUrl
    ELSIF catalog_snapshot_in ? 'imageUrl' AND catalog_snapshot_in->>'imageUrl' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'imageUrl');
    -- Try image_url (alternate naming)
    ELSIF catalog_snapshot_in ? 'image_url' AND catalog_snapshot_in->>'image_url' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'image_url');
    END IF;
  END IF;

  -- Extract PSA cert for PSA-related items
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

  -- Insert item explicitly into that lot with correct type and extracted image URLs
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
    image_urls,  -- Store extracted image URLs
    psa_cert,    -- Store PSA cert if available
    psa_cert_number  -- Also store in psa_cert_number for compatibility
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
    v_lot_num,
    v_item_type,
    v_image_urls,  -- Extracted image URLs
    v_psa_cert,    -- PSA cert
    v_psa_cert     -- PSA cert number (same value)
  )
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  RETURN QUERY SELECT v_id, v_lot, v_created;
END;
$$;