-- Fix the create_raw_intake_item function to set correct type based on grade
-- Also update existing graded items that are incorrectly marked as Raw

-- First, update existing records that have grades but are marked as Raw
UPDATE intake_items 
SET type = 'Graded'
WHERE grade IS NOT NULL 
  AND grade != '' 
  AND grade != '0'
  AND type = 'Raw'
  AND deleted_at IS NULL;

-- Now update the create_raw_intake_item function to handle type correctly
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
  source_provider_in text DEFAULT NULL,
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
AS $$
DECLARE
  _user_id uuid;
  _current_lot_id uuid;
  _current_lot_number text;
  _new_item_id uuid;
  _item_type text;
BEGIN
  -- Get current user
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Determine item type based on grade
  IF grade_in IS NOT NULL AND grade_in != '' AND grade_in != '0' THEN
    _item_type := 'Graded';
  ELSE
    _item_type := 'Raw';
  END IF;

  -- Get or create current lot
  SELECT lot_id, lot_number 
  INTO _current_lot_id, _current_lot_number
  FROM current_lots 
  WHERE store_key = store_key_in 
    AND shopify_location_gid = shopify_location_gid_in;

  -- If no current lot, create one
  IF _current_lot_id IS NULL THEN
    INSERT INTO lots (store_key, shopify_location_gid, status, created_by)
    VALUES (store_key_in, shopify_location_gid_in, 'open', _user_id)
    RETURNING id, lot_number INTO _current_lot_id, _current_lot_number;

    -- Insert into current_lots
    INSERT INTO current_lots (store_key, shopify_location_gid, lot_id, lot_number)
    VALUES (store_key_in, shopify_location_gid_in, _current_lot_id, _current_lot_number);
  END IF;

  -- Insert the intake item with correct type
  INSERT INTO intake_items (
    lot_id,
    lot_number,
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
    type,  -- Set the correct type
    created_by
  ) VALUES (
    _current_lot_id,
    _current_lot_number,
    store_key_in,
    shopify_location_gid_in,
    quantity_in,
    brand_title_in,
    subject_in,
    category_in,
    variant_in,
    card_number_in,
    grade_in,
    price_in,
    cost_in,
    sku_in,
    source_provider_in,
    catalog_snapshot_in,
    pricing_snapshot_in,
    processing_notes_in,
    _item_type,  -- Use the determined type
    _user_id
  ) RETURNING intake_items.id INTO _new_item_id;

  -- Return the created item info
  RETURN QUERY
  SELECT 
    _new_item_id,
    _current_lot_number,
    NOW()::timestamptz;
END;
$$;