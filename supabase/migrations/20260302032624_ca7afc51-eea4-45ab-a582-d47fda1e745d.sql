-- Fix BOTH overloads of create_raw_intake_item to enforce qty=1 for graded items on conflict

-- 1) Fix the overload WITHOUT grading_company_in parameter
-- Change the ON CONFLICT quantity logic to check if the item is graded
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer,
  brand_title_in text DEFAULT NULL,
  subject_in text DEFAULT NULL,
  category_in text DEFAULT NULL,
  variant_in text DEFAULT NULL,
  card_number_in text DEFAULT NULL,
  grade_in text DEFAULT NULL,
  price_in numeric DEFAULT 0,
  cost_in numeric DEFAULT NULL,
  sku_in text DEFAULT NULL,
  source_provider_in text DEFAULT NULL,
  main_category_in text DEFAULT 'cards',
  sub_category_in text DEFAULT NULL,
  year_in text DEFAULT NULL,
  catalog_snapshot_in jsonb DEFAULT NULL,
  pricing_snapshot_in jsonb DEFAULT NULL,
  processing_notes_in text DEFAULT NULL
)
RETURNS TABLE(id uuid, lot_number text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_user_id uuid;
  v_store_key text;
  v_location_gid text;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  v_store_key := btrim(store_key_in);
  v_location_gid := btrim(shopify_location_gid_in);
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be logged in to create items.';
  END IF;
  
  IF v_store_key IS NULL OR v_store_key = '' THEN
    RAISE EXCEPTION 'INVALID_STORE: Store key is required.';
  END IF;
  
  IF v_location_gid IS NULL OR v_location_gid = '' THEN
    RAISE EXCEPTION 'INVALID_LOCATION: Location is required.';
  END IF;
  
  RAISE LOG '[create_raw_intake_item] Starting creation for user=% store=% location=%', 
    v_user_id, v_store_key, v_location_gid;

  SELECT EXISTS (
    SELECT 1 FROM public.user_shopify_assignments usa
    WHERE usa.user_id = v_user_id
      AND usa.store_key = v_store_key
      AND usa.location_gid = v_location_gid
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'ACCESS_DENIED: You do not have permission to add items to store "%" at location "%".', 
      v_store_key, v_location_gid;
  END IF;

  IF grade_in IS NOT NULL AND grade_in != '' AND grade_in != '0' THEN
    v_item_type := 'Graded';
  ELSE
    v_item_type := 'Raw';
  END IF;

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

  v_psa_cert := NULL;
  IF catalog_snapshot_in IS NOT NULL THEN
    IF catalog_snapshot_in ? 'psa_cert' THEN
      v_psa_cert := catalog_snapshot_in->>'psa_cert';
    ELSIF catalog_snapshot_in ? 'certNumber' THEN
      v_psa_cert := catalog_snapshot_in->>'certNumber';
    END IF;
  END IF;

  SELECT lot.id, lot.lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(v_store_key, v_location_gid) AS lot(id, lot_number);

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'LOT_ERROR: Failed to create or find an active batch.';
  END IF;

  INSERT INTO public.intake_items (
    store_key, shopify_location_gid, quantity, brand_title, subject, category,
    variant, card_number, grade, price, cost, sku, source_provider,
    catalog_snapshot, pricing_snapshot, processing_notes, unique_item_uid,
    created_by, lot_id, lot_number, type, image_urls,
    psa_cert, psa_cert_number, main_category, sub_category, year
  )
  VALUES (
    v_store_key, v_location_gid, greatest(1, coalesce(quantity_in, 1)),
    brand_title_in, subject_in, category_in, variant_in, card_number_in,
    grade_in, coalesce(price_in, 0), cost_in, sku_in,
    coalesce(source_provider_in, 'manual'),
    catalog_snapshot_in, pricing_snapshot_in, processing_notes_in,
    gen_random_uuid(), v_user_id, v_lot_id, v_lot_num, v_item_type,
    v_image_urls, v_psa_cert, v_psa_cert, main_category_in, sub_category_in, year_in
  )
  ON CONFLICT (store_key, sku, shopify_location_gid) 
  DO UPDATE SET
    -- Graded items (1-of-1): keep quantity at 1; Raw items: increment
    quantity = CASE 
      WHEN intake_items.grading_company IS NOT NULL AND intake_items.grading_company != '' AND intake_items.grading_company != 'none'
      THEN 1
      WHEN EXCLUDED.grade IS NOT NULL AND EXCLUDED.grade != '' AND EXCLUDED.grade != '0'
      THEN 1
      ELSE intake_items.quantity + EXCLUDED.quantity
    END,
    lot_id = EXCLUDED.lot_id,
    lot_number = EXCLUDED.lot_number,
    deleted_at = NULL,
    removed_from_batch_at = NULL,
    updated_at = now(),
    updated_by = v_user_id::text
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'INSERT_FAILED: Failed to create the item.';
  END IF;

  RETURN QUERY SELECT v_id, v_lot, v_created;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[create_raw_intake_item] ERROR: % - SQLSTATE: %', SQLERRM, SQLSTATE;
    IF SQLERRM NOT LIKE 'AUTH_REQUIRED:%' 
       AND SQLERRM NOT LIKE 'INVALID_STORE:%' 
       AND SQLERRM NOT LIKE 'INVALID_LOCATION:%'
       AND SQLERRM NOT LIKE 'ACCESS_DENIED:%'
       AND SQLERRM NOT LIKE 'LOT_ERROR:%'
       AND SQLERRM NOT LIKE 'INSERT_FAILED:%' THEN
      RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- 2) Fix the overload WITH grading_company_in parameter
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer,
  brand_title_in text DEFAULT NULL,
  subject_in text DEFAULT NULL,
  category_in text DEFAULT NULL,
  variant_in text DEFAULT NULL,
  card_number_in text DEFAULT NULL,
  grade_in text DEFAULT NULL,
  price_in numeric DEFAULT 0,
  cost_in numeric DEFAULT NULL,
  sku_in text DEFAULT NULL,
  source_provider_in text DEFAULT NULL,
  main_category_in text DEFAULT 'cards',
  sub_category_in text DEFAULT NULL,
  year_in text DEFAULT NULL,
  grading_company_in text DEFAULT NULL,
  catalog_snapshot_in jsonb DEFAULT NULL,
  pricing_snapshot_in jsonb DEFAULT NULL,
  processing_notes_in text DEFAULT NULL
)
RETURNS TABLE(id uuid, lot_number text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_cgc_cert text;
  v_user_id uuid;
  v_store_key text;
  v_location_gid text;
  v_has_access boolean;
  v_grading_company text;
BEGIN
  v_user_id := auth.uid();
  v_store_key := btrim(store_key_in);
  v_location_gid := btrim(shopify_location_gid_in);
  v_grading_company := UPPER(COALESCE(btrim(grading_company_in), 'PSA'));
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be logged in to create items.';
  END IF;
  
  IF v_store_key IS NULL OR v_store_key = '' THEN
    RAISE EXCEPTION 'INVALID_STORE: Store key is required.';
  END IF;
  
  IF v_location_gid IS NULL OR v_location_gid = '' THEN
    RAISE EXCEPTION 'INVALID_LOCATION: Location is required.';
  END IF;
  
  RAISE LOG '[create_raw_intake_item] Starting creation for user=% store=% location=% grading_company=%', 
    v_user_id, v_store_key, v_location_gid, v_grading_company;

  SELECT EXISTS (
    SELECT 1 FROM public.user_shopify_assignments usa
    WHERE usa.user_id = v_user_id
      AND usa.store_key = v_store_key
      AND usa.location_gid = v_location_gid
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'ACCESS_DENIED: You do not have permission to add items to store "%" at location "%".', 
      v_store_key, v_location_gid;
  END IF;

  IF grade_in IS NOT NULL AND grade_in != '' AND grade_in != '0' THEN
    v_item_type := 'Graded';
  ELSE
    v_item_type := 'Raw';
  END IF;

  v_image_urls := NULL;
  IF catalog_snapshot_in IS NOT NULL THEN
    IF catalog_snapshot_in ? 'imageUrls' AND jsonb_typeof(catalog_snapshot_in->'imageUrls') = 'array' THEN
      v_image_urls := catalog_snapshot_in->'imageUrls';
    ELSIF catalog_snapshot_in ? 'imageUrl' AND catalog_snapshot_in->>'imageUrl' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'imageUrl');
    ELSIF catalog_snapshot_in ? 'image_url' AND catalog_snapshot_in->>'image_url' != '' THEN
      v_image_urls := jsonb_build_array(catalog_snapshot_in->>'image_url');
    ELSIF catalog_snapshot_in ? 'images' AND jsonb_typeof(catalog_snapshot_in->'images') = 'object' THEN
      v_image_urls := jsonb_build_array();
      IF catalog_snapshot_in->'images' ? 'front' AND catalog_snapshot_in->'images'->>'front' != '' THEN
        v_image_urls := v_image_urls || jsonb_build_array(catalog_snapshot_in->'images'->>'front');
      END IF;
      IF catalog_snapshot_in->'images' ? 'rear' AND catalog_snapshot_in->'images'->>'rear' != '' THEN
        v_image_urls := v_image_urls || jsonb_build_array(catalog_snapshot_in->'images'->>'rear');
      END IF;
      IF jsonb_array_length(v_image_urls) = 0 THEN
        v_image_urls := NULL;
      END IF;
    END IF;
  END IF;

  v_psa_cert := NULL;
  IF v_grading_company = 'PSA' THEN
    IF catalog_snapshot_in IS NOT NULL THEN
      IF catalog_snapshot_in ? 'psa_cert' THEN
        v_psa_cert := catalog_snapshot_in->>'psa_cert';
      ELSIF catalog_snapshot_in ? 'certNumber' THEN
        v_psa_cert := catalog_snapshot_in->>'certNumber';
      END IF;
    END IF;
    IF v_psa_cert IS NULL OR v_psa_cert = '' THEN
      v_psa_cert := sku_in;
    END IF;
  END IF;

  v_cgc_cert := NULL;
  IF v_grading_company = 'CGC' THEN
    IF catalog_snapshot_in IS NOT NULL THEN
      IF catalog_snapshot_in ? 'cgc_cert' THEN
        v_cgc_cert := catalog_snapshot_in->>'cgc_cert';
      ELSIF catalog_snapshot_in ? 'certNumber' THEN
        v_cgc_cert := catalog_snapshot_in->>'certNumber';
      END IF;
    END IF;
    IF v_cgc_cert IS NULL OR v_cgc_cert = '' THEN
      v_cgc_cert := sku_in;
    END IF;
  END IF;

  SELECT lot.id, lot.lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(v_store_key, v_location_gid) AS lot(id, lot_number);

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'LOT_ERROR: Failed to create or find an active batch.';
  END IF;

  INSERT INTO public.intake_items (
    store_key, shopify_location_gid, quantity, brand_title, subject, category,
    variant, card_number, grade, price, cost, sku, source_provider,
    catalog_snapshot, pricing_snapshot, processing_notes, unique_item_uid,
    created_by, lot_id, lot_number, type, image_urls,
    psa_cert, psa_cert_number, cgc_cert,
    main_category, sub_category, year, grading_company
  )
  VALUES (
    v_store_key, v_location_gid, greatest(1, coalesce(quantity_in, 1)),
    brand_title_in, subject_in, category_in, variant_in, card_number_in,
    grade_in, coalesce(price_in, 0), cost_in, sku_in,
    coalesce(source_provider_in, 'manual'),
    catalog_snapshot_in, pricing_snapshot_in, processing_notes_in,
    gen_random_uuid(), v_user_id, v_lot_id, v_lot_num, v_item_type,
    v_image_urls, v_psa_cert, v_psa_cert, v_cgc_cert,
    main_category_in, sub_category_in, year_in, v_grading_company
  )
  ON CONFLICT (store_key, sku, shopify_location_gid) 
  DO UPDATE SET
    -- Graded items (1-of-1): ALWAYS keep quantity at 1
    quantity = CASE 
      WHEN intake_items.grading_company IS NOT NULL AND intake_items.grading_company != '' AND intake_items.grading_company != 'none'
      THEN 1
      WHEN v_grading_company IS NOT NULL AND v_grading_company != '' AND v_grading_company != 'NONE'
      THEN 1
      WHEN EXCLUDED.grade IS NOT NULL AND EXCLUDED.grade != '' AND EXCLUDED.grade != '0'
      THEN 1
      ELSE intake_items.quantity + EXCLUDED.quantity
    END,
    lot_id = EXCLUDED.lot_id,
    lot_number = EXCLUDED.lot_number,
    deleted_at = NULL,
    removed_from_batch_at = NULL,
    updated_at = now(),
    updated_by = v_user_id::text,
    grading_company = COALESCE(EXCLUDED.grading_company, intake_items.grading_company)
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'INSERT_FAILED: Failed to create the item.';
  END IF;

  RETURN QUERY SELECT v_id, v_lot, v_created;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[create_raw_intake_item] ERROR: % - SQLSTATE: %', SQLERRM, SQLSTATE;
    IF SQLERRM NOT LIKE 'AUTH_REQUIRED:%' 
       AND SQLERRM NOT LIKE 'INVALID_STORE:%' 
       AND SQLERRM NOT LIKE 'INVALID_LOCATION:%'
       AND SQLERRM NOT LIKE 'ACCESS_DENIED:%'
       AND SQLERRM NOT LIKE 'LOT_ERROR:%'
       AND SQLERRM NOT LIKE 'INSERT_FAILED:%' THEN
      RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- Also reset the current bad data
UPDATE public.intake_items 
SET quantity = 1, updated_at = now() 
WHERE grading_company IS NOT NULL 
  AND grading_company != '' 
  AND grading_company != 'none' 
  AND quantity > 1;