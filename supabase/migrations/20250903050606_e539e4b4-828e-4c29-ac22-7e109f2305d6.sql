-- Create minimal RLS-respecting RPC for raw intake item creation
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
  source_provider_in text DEFAULT 'manual',
  catalog_snapshot_in jsonb DEFAULT NULL,
  pricing_snapshot_in jsonb DEFAULT NULL,
  processing_notes_in text DEFAULT NULL
)
RETURNS TABLE(id uuid, lot_number text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_lot_number text;
  v_created_at timestamp with time zone;
BEGIN
  -- Insert the intake item with minimal required fields
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
    unique_item_uid
  )
  VALUES (
    store_key_in,
    shopify_location_gid_in,
    COALESCE(quantity_in, 1),
    brand_title_in,
    subject_in,
    category_in,
    variant_in,
    card_number_in,
    grade_in,
    COALESCE(price_in, 0),
    cost_in,
    sku_in,
    COALESCE(source_provider_in, 'manual'),
    catalog_snapshot_in,
    pricing_snapshot_in,
    processing_notes_in,
    gen_random_uuid()
  )
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_item_id, v_lot_number, v_created_at;

  -- Return the minimal response
  RETURN QUERY SELECT v_item_id, v_lot_number, v_created_at;
END;
$function$;