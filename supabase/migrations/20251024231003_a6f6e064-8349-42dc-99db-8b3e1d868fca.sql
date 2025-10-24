-- Drop the old 16-parameter version of create_raw_intake_item
-- This fixes PGRST203 function overloading conflict
-- The 18-parameter version (with main_category_in and sub_category_in) remains

DROP FUNCTION IF EXISTS public.create_raw_intake_item(
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
  source_provider_in text,
  catalog_snapshot_in jsonb,
  pricing_snapshot_in jsonb,
  processing_notes_in text
);