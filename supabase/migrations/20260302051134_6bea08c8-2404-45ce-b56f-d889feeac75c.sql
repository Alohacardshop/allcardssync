
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(
  store_key_in text,
  shopify_location_gid_in text,
  quantity_in integer DEFAULT 1,
  brand_title_in text DEFAULT NULL::text,
  subject_in text DEFAULT NULL::text,
  category_in text DEFAULT NULL::text,
  variant_in text DEFAULT NULL::text,
  card_number_in text DEFAULT NULL::text,
  grade_in text DEFAULT NULL::text,
  price_in numeric DEFAULT NULL::numeric,
  cost_in numeric DEFAULT NULL::numeric,
  sku_in text DEFAULT NULL::text,
  source_provider_in text DEFAULT NULL::text,
  catalog_snapshot_in jsonb DEFAULT NULL::jsonb,
  pricing_snapshot_in jsonb DEFAULT NULL::jsonb,
  processing_notes_in text DEFAULT NULL::text,
  main_category_in text DEFAULT NULL::text,
  sub_category_in text DEFAULT NULL::text,
  year_in text DEFAULT NULL::text,
  grading_company_in text DEFAULT 'none'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_sku text;
  v_lot_number text;
  v_image_urls text[];
  v_psa_cert text;
  v_cgc_cert text;
  v_active_lot_id uuid;
BEGIN
  v_sku := COALESCE(sku_in, 'RAW-' || substr(gen_random_uuid()::text, 1, 8));
  v_lot_number := 'LOT-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- Get or create the active lot for this store/location
  SELECT id INTO v_active_lot_id
  FROM get_or_create_active_lot(store_key_in, shopify_location_gid_in);

  IF catalog_snapshot_in IS NOT NULL THEN
    IF catalog_snapshot_in ? 'imageUrls' AND jsonb_typeof(catalog_snapshot_in->'imageUrls') = 'array' THEN
      SELECT array_agg(elem::text) INTO v_image_urls
      FROM jsonb_array_elements_text(catalog_snapshot_in->'imageUrls') AS elem;
    ELSIF catalog_snapshot_in ? 'imageUrl' THEN
      v_image_urls := ARRAY[catalog_snapshot_in->>'imageUrl'];
    END IF;
    IF catalog_snapshot_in ? 'psa_cert' THEN
      v_psa_cert := catalog_snapshot_in->>'psa_cert';
    END IF;
    IF catalog_snapshot_in ? 'cgc_cert' THEN
      v_cgc_cert := catalog_snapshot_in->>'cgc_cert';
    END IF;
  END IF;

  INSERT INTO public.intake_items (
    store_key, shopify_location_gid, quantity, brand_title, subject,
    category, variant, card_number, grade, price, cost, sku,
    source_provider, catalog_snapshot, pricing_snapshot, processing_notes,
    main_category, sub_category, year, grading_company, lot_number,
    image_urls, psa_cert, cgc_cert, created_by, lot_id
  )
  VALUES (
    store_key_in, shopify_location_gid_in, quantity_in, brand_title_in, subject_in,
    category_in, variant_in, card_number_in, grade_in, price_in, cost_in, v_sku,
    source_provider_in, catalog_snapshot_in, pricing_snapshot_in, processing_notes_in,
    main_category_in, sub_category_in, year_in, grading_company_in, v_lot_number,
    to_jsonb(v_image_urls), v_psa_cert, v_cgc_cert, auth.uid(), v_active_lot_id
  )
  ON CONFLICT (store_key, sku, shopify_location_gid)
  DO UPDATE SET
    quantity = CASE 
      WHEN intake_items.grading_company IS NOT NULL AND intake_items.grading_company != 'none' THEN 1
      WHEN EXCLUDED.grading_company IS NOT NULL AND EXCLUDED.grading_company != 'none' THEN 1
      ELSE intake_items.quantity + EXCLUDED.quantity
    END,
    lot_id = v_active_lot_id,
    deleted_at = NULL,
    deleted_reason = NULL,
    removed_from_batch_at = NULL,
    brand_title = COALESCE(EXCLUDED.brand_title, intake_items.brand_title),
    subject = COALESCE(EXCLUDED.subject, intake_items.subject),
    category = COALESCE(EXCLUDED.category, intake_items.category),
    variant = COALESCE(EXCLUDED.variant, intake_items.variant),
    card_number = COALESCE(EXCLUDED.card_number, intake_items.card_number),
    grade = COALESCE(EXCLUDED.grade, intake_items.grade),
    price = COALESCE(EXCLUDED.price, intake_items.price),
    cost = COALESCE(EXCLUDED.cost, intake_items.cost),
    source_provider = COALESCE(EXCLUDED.source_provider, intake_items.source_provider),
    catalog_snapshot = COALESCE(EXCLUDED.catalog_snapshot, intake_items.catalog_snapshot),
    pricing_snapshot = COALESCE(EXCLUDED.pricing_snapshot, intake_items.pricing_snapshot),
    processing_notes = COALESCE(EXCLUDED.processing_notes, intake_items.processing_notes),
    main_category = COALESCE(EXCLUDED.main_category, intake_items.main_category),
    sub_category = COALESCE(EXCLUDED.sub_category, intake_items.sub_category),
    year = COALESCE(EXCLUDED.year, intake_items.year),
    grading_company = COALESCE(EXCLUDED.grading_company, intake_items.grading_company),
    image_urls = COALESCE(EXCLUDED.image_urls, intake_items.image_urls),
    psa_cert = COALESCE(EXCLUDED.psa_cert, intake_items.psa_cert),
    cgc_cert = COALESCE(EXCLUDED.cgc_cert, intake_items.cgc_cert),
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
