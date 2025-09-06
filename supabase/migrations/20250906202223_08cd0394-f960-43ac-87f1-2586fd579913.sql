
-- 1) Ensure we can reuse the current active lot per user/store/location
CREATE OR REPLACE FUNCTION public.get_or_create_active_lot(_store_key text, _location_gid text)
RETURNS TABLE(id uuid, lot_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_lot text;
BEGIN
  -- Find latest active lot for this user at the selected store/location
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
    RETURNING id, lot_number INTO v_id, v_lot;
  END IF;

  RETURN QUERY SELECT v_id, v_lot;
END;
$$;

-- 2) Update create_raw_intake_item to attach new items to the user's active lot instead of generating a new lot each time
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
  SELECT id, lot_number INTO v_lot_id, v_lot_num
  FROM public.get_or_create_active_lot(btrim(store_key_in), btrim(shopify_location_gid_in));

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

-- 3) Update the inventory sync trigger function to NOT sync on INSERT.
--    Sync only after items are explicitly sent to inventory (removed_from_batch_at set),
--    and on subsequent changes to already-sent items.
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sync_payload jsonb;
BEGIN
  IF tg_op = 'DELETE' THEN
    -- Only sync deletions if the item had been sent to inventory previously
    IF old.sku IS NOT NULL
       AND old.store_key IS NOT NULL
       AND old.removed_from_batch_at IS NOT NULL
    THEN
      sync_payload := jsonb_build_object(
        'storeKey', old.store_key,
        'sku', old.sku,
        'locationGid', old.shopify_location_gid
      );
      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Shopify sync dispatch failed (DELETE): %', SQLERRM;
      END;
    END IF;
    RETURN old;

  ELSE
    IF tg_op = 'INSERT' THEN
      -- Do NOT sync on initial insert; still in intake batch
      RETURN new;
    END IF;

    -- UPDATE: Only sync when the item is in "inventory" state (removed_from_batch_at is not null)
    IF new.sku IS NOT NULL
       AND new.store_key IS NOT NULL
       AND new.removed_from_batch_at IS NOT NULL
       AND (
         old.sku IS DISTINCT FROM new.sku OR
         old.quantity IS DISTINCT FROM new.quantity OR
         old.deleted_at IS DISTINCT FROM new.deleted_at OR
         old.removed_from_batch_at IS DISTINCT FROM new.removed_from_batch_at OR
         old.store_key IS DISTINCT FROM new.store_key OR
         old.shopify_location_gid IS DISTINCT FROM new.shopify_location_gid
       )
    THEN
      -- Sync the current (new) state
      sync_payload := jsonb_build_object(
        'storeKey', new.store_key,
        'sku', new.sku,
        'locationGid', new.shopify_location_gid
      );
      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Shopify sync dispatch failed (UPDATE new): %', SQLERRM;
      END;

      -- If the SKU changed, also sync the old SKU, but only if it had been sent previously
      IF old.sku IS DISTINCT FROM new.sku
         AND old.sku IS NOT NULL
         AND old.removed_from_batch_at IS NOT NULL
      THEN
        sync_payload := jsonb_build_object(
          'storeKey', old.store_key,
          'sku', old.sku,
          'locationGid', old.shopify_location_gid
        );
        BEGIN
          PERFORM public.http_post_async(
            url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body    := sync_payload
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Shopify sync dispatch failed (UPDATE old sku): %', SQLERRM;
        END;
      END IF;
    END IF;

    RETURN new;
  END IF;
END;
$function$;
