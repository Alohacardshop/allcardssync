-- Drop and recreate create_raw_intake_item with improved error messages
DROP FUNCTION IF EXISTS public.create_raw_intake_item(text, text, integer, text, text, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, text, text, text);

CREATE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer,
  lot_number_in text,
  subject_in text,
  brand_title_in text,
  card_number_in text,
  year_in text,
  grade_in text,
  price_in numeric,
  cost_in numeric,
  grading_company_in text,
  variant_in text,
  grading_data_in jsonb,
  catalog_snapshot_in jsonb,
  processing_notes_in text,
  main_category_in text,
  sub_category_in text
)
RETURNS TABLE(id uuid, lot_number text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_key text := btrim(store_key_in);
  v_location_gid text := btrim(shopify_location_gid_in);
  v_lot_id uuid;
  v_lot_num text;
  v_id uuid;
  v_lot text;
  v_created timestamptz;
  v_type text;
  v_has_access boolean;
BEGIN
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

  -- Get or create active lot for this user/store/location
  SELECT lot.id, lot.lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(v_store_key, v_location_gid) AS lot(id, lot_number);

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'LOT_ERROR: Failed to create or find an active batch for your session. This may be a temporary issue. Please try again or contact support if the problem persists.';
  END IF;

  RAISE LOG '[create_raw_intake_item] Using lot=% (%) for user=%', v_lot_id, v_lot_num, v_user_id;

  -- Determine type based on grade
  IF grade_in IS NOT NULL AND grade_in != '' THEN
    v_type := 'graded';
  ELSE
    v_type := 'raw';
  END IF;

  -- Insert item with ON CONFLICT handling for duplicate SKU
  INSERT INTO public.intake_items (
    store_key,
    shopify_location_gid,
    quantity,
    lot_id,
    lot_number,
    subject,
    brand_title,
    card_number,
    year,
    grade,
    price,
    cost,
    grading_company,
    variant,
    grading_data,
    catalog_snapshot,
    processing_notes,
    main_category,
    sub_category,
    type,
    created_by
  )
  VALUES (
    v_store_key,
    v_location_gid,
    quantity_in,
    v_lot_id,
    v_lot_num,
    subject_in,
    brand_title_in,
    card_number_in,
    year_in,
    grade_in,
    price_in,
    cost_in,
    grading_company_in,
    variant_in,
    grading_data_in,
    catalog_snapshot_in,
    processing_notes_in,
    main_category_in,
    sub_category_in,
    v_type,
    v_user_id
  )
  ON CONFLICT ON CONSTRAINT uniq_store_sku_location
  DO UPDATE SET
    quantity = intake_items.quantity + EXCLUDED.quantity,
    price = COALESCE(EXCLUDED.price, intake_items.price),
    cost = COALESCE(EXCLUDED.cost, intake_items.cost),
    updated_at = now(),
    updated_by = v_user_id
  RETURNING 
    intake_items.id,
    intake_items.lot_number,
    intake_items.created_at
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
$$;

-- Ensure permissions are correct
GRANT EXECUTE ON FUNCTION public.create_raw_intake_item(
  text, text, integer, text, text, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, text, text, text
) TO authenticated;