-- Fix create_raw_intake_item to clear deleted_at and removed_from_batch_at on upsert
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(store_key_in text, shopify_location_gid_in text, quantity_in integer DEFAULT 1, brand_title_in text DEFAULT ''::text, subject_in text DEFAULT ''::text, category_in text DEFAULT ''::text, variant_in text DEFAULT ''::text, card_number_in text DEFAULT ''::text, grade_in text DEFAULT ''::text, price_in numeric DEFAULT 0, cost_in numeric DEFAULT NULL::numeric, sku_in text DEFAULT ''::text, source_provider_in text DEFAULT 'manual'::text, catalog_snapshot_in jsonb DEFAULT NULL::jsonb, pricing_snapshot_in jsonb DEFAULT NULL::jsonb, processing_notes_in text DEFAULT NULL::text, main_category_in text DEFAULT NULL::text, sub_category_in text DEFAULT NULL::text)
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
  v_store_key text;
  v_location_gid text;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  v_store_key := btrim(store_key_in);
  v_location_gid := btrim(shopify_location_gid_in);
  
  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be logged in to create items. Please sign in and try again.';
  END IF;
  
  -- Validate required parameters
  IF v_store_key IS NULL OR v_store_key = '' THEN
    RAISE EXCEPTION 'INVALID_STORE: Store key is required. Please select a store and try again.';
  END IF;
  
  IF v_location_gid IS NULL OR v_location_gid = '' THEN
    RAISE EXCEPTION 'INVALID_LOCATION: Location is required. Please select a location and try again.';
  END IF;
  
  -- Log the creation attempt
  RAISE LOG '[create_raw_intake_item] Starting creation for user=% store=% location=%', 
    v_user_id, v_store_key, v_location_gid;

  -- Check user has access to this store/location
  SELECT EXISTS (
    SELECT 1 FROM public.user_shopify_assignments usa
    WHERE usa.user_id = v_user_id
      AND usa.store_key = v_store_key
      AND usa.location_gid = v_location_gid
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'ACCESS_DENIED: You do not have permission to add items to store "%" at location "%". Contact your administrator to request access.', 
      v_store_key, v_location_gid;
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
  FROM public.get_or_create_active_lot(v_store_key, v_location_gid) AS lot(id, lot_number);

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'LOT_ERROR: Failed to create or find an active batch for your session. This may be a temporary issue. Please try again or contact support if the problem persists.';
  END IF;

  RAISE LOG '[create_raw_intake_item] Using lot=% (%) for user=%', v_lot_id, v_lot_num, v_user_id;

  -- Insert item with ON CONFLICT handling for duplicate SKU
  -- CRITICAL: Clear deleted_at and removed_from_batch_at on upsert to make item visible again
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
    v_store_key,
    v_location_gid,
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
  ON CONFLICT (store_key, sku, shopify_location_gid) 
  DO UPDATE SET
    quantity = intake_items.quantity + EXCLUDED.quantity,
    lot_id = EXCLUDED.lot_id,
    lot_number = EXCLUDED.lot_number,
    deleted_at = NULL,  -- Clear soft-delete to make item visible again
    removed_from_batch_at = NULL,  -- Clear batch removal to show in current batch
    updated_at = now(),
    updated_by = v_user_id::text
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_id, v_lot, v_created;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'INSERT_FAILED: Failed to create the item. This may be due to a database constraint. Please check your input and try again.';
  END IF;

  RAISE LOG '[create_raw_intake_item] Created/updated item=% in lot=% for user=%', v_id, v_lot, v_user_id;

  RETURN QUERY SELECT v_id, v_lot, v_created;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error with details
    RAISE LOG '[create_raw_intake_item] ERROR: % - SQLSTATE: % for user=% store=% location=%', 
      SQLERRM, SQLSTATE, v_user_id, v_store_key, v_location_gid;
    -- Re-raise with context if not already a custom exception
    IF SQLERRM NOT LIKE 'AUTH_REQUIRED:%' 
       AND SQLERRM NOT LIKE 'INVALID_STORE:%' 
       AND SQLERRM NOT LIKE 'INVALID_LOCATION:%'
       AND SQLERRM NOT LIKE 'ACCESS_DENIED:%'
       AND SQLERRM NOT LIKE 'LOT_ERROR:%'
       AND SQLERRM NOT LIKE 'INSERT_FAILED:%' THEN
      RAISE EXCEPTION 'UNEXPECTED_ERROR: An unexpected error occurred while creating the item: %. Please try again or contact support.', SQLERRM;
    ELSE
      RAISE;
    END IF;
END;
$function$;

-- Data fix: Clear deleted_at and removed_from_batch_at for items in active lots
-- This fixes items that were previously soft-deleted but re-added via upsert
UPDATE public.intake_items i
SET 
  deleted_at = NULL,
  removed_from_batch_at = NULL,
  updated_at = now()
FROM public.intake_lots l
WHERE i.lot_id = l.id
  AND l.status = 'active'
  AND (i.deleted_at IS NOT NULL OR i.removed_from_batch_at IS NOT NULL);