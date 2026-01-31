-- ================================================
-- BACKFILL: Legacy eBay items into cards table
-- ================================================
-- This migration ensures all graded items with eBay listings
-- are registered in the cards table for atomic sale locking.

-- Create a helper function to ensure a card exists for a given SKU
CREATE OR REPLACE FUNCTION ensure_card_exists(
  p_sku TEXT,
  p_source TEXT DEFAULT 'backfill'
)
RETURNS TABLE(
  card_id UUID,
  was_created BOOLEAN,
  status card_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_id UUID;
  v_was_created BOOLEAN := FALSE;
  v_status card_status;
  v_intake intake_items%ROWTYPE;
BEGIN
  -- First check if card already exists
  SELECT id, cards.status INTO v_card_id, v_status
  FROM cards
  WHERE cards.sku = p_sku;
  
  IF v_card_id IS NOT NULL THEN
    -- Card exists, return it
    RETURN QUERY SELECT v_card_id, FALSE, v_status;
    RETURN;
  END IF;
  
  -- Card doesn't exist - fetch intake_item data
  SELECT * INTO v_intake
  FROM intake_items
  WHERE intake_items.sku = p_sku
    AND intake_items.type = 'Graded'
    AND intake_items.deleted_at IS NULL
  LIMIT 1;
  
  IF v_intake.id IS NULL THEN
    -- No intake item found, cannot create card
    RETURN;
  END IF;
  
  -- Determine status based on quantity
  IF v_intake.quantity > 0 AND v_intake.sold_at IS NULL THEN
    v_status := 'available';
  ELSE
    v_status := 'sold';
  END IF;
  
  -- Create the card
  INSERT INTO cards (
    sku,
    status,
    ebay_offer_id,
    shopify_variant_id,
    shopify_inventory_item_id,
    current_shopify_location_id
  ) VALUES (
    p_sku,
    v_status,
    v_intake.ebay_offer_id,
    v_intake.shopify_variant_id,
    v_intake.shopify_inventory_item_id,
    v_intake.shopify_location_gid
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id INTO v_card_id;
  
  IF v_card_id IS NOT NULL THEN
    v_was_created := TRUE;
    
    -- Log the auto-creation
    INSERT INTO system_logs (level, message, source, context)
    VALUES (
      'warn',
      'Legacy card auto-created for atomic locking',
      'ensure_card_exists',
      jsonb_build_object(
        'sku', p_sku,
        'source', p_source,
        'intake_item_id', v_intake.id,
        'status', v_status,
        'ebay_offer_id', v_intake.ebay_offer_id,
        'shopify_variant_id', v_intake.shopify_variant_id
      )
    );
  ELSE
    -- Race condition: another process created it
    SELECT id, cards.status INTO v_card_id, v_status
    FROM cards
    WHERE cards.sku = p_sku;
  END IF;
  
  RETURN QUERY SELECT v_card_id, v_was_created, v_status;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION ensure_card_exists(TEXT, TEXT) TO service_role;

-- ================================================
-- ONE-TIME BACKFILL: Insert all legacy eBay graded items
-- ================================================
DO $$
DECLARE
  v_count INT := 0;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT DISTINCT ON (ii.sku)
      ii.sku,
      ii.ebay_offer_id,
      ii.shopify_variant_id,
      ii.shopify_inventory_item_id,
      ii.shopify_location_gid,
      ii.quantity,
      ii.sold_at
    FROM intake_items ii
    WHERE ii.type = 'Graded'
      AND ii.sku IS NOT NULL
      AND ii.deleted_at IS NULL
      AND (ii.ebay_offer_id IS NOT NULL OR ii.shopify_product_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM cards c WHERE c.sku = ii.sku
      )
    ORDER BY ii.sku, ii.created_at DESC
  LOOP
    INSERT INTO cards (
      sku,
      status,
      ebay_offer_id,
      shopify_variant_id,
      shopify_inventory_item_id,
      current_shopify_location_id
    ) VALUES (
      v_item.sku,
      CASE 
        WHEN v_item.quantity > 0 AND v_item.sold_at IS NULL THEN 'available'::card_status
        ELSE 'sold'::card_status
      END,
      v_item.ebay_offer_id,
      v_item.shopify_variant_id,
      v_item.shopify_inventory_item_id,
      v_item.shopify_location_gid
    )
    ON CONFLICT (sku) DO NOTHING;
    
    v_count := v_count + 1;
  END LOOP;
  
  -- Log the backfill
  IF v_count > 0 THEN
    INSERT INTO system_logs (level, message, source, context)
    VALUES (
      'info',
      'Backfill complete: legacy graded items added to cards table',
      'migration_backfill',
      jsonb_build_object('cards_created', v_count)
    );
  END IF;
  
  RAISE NOTICE 'Backfilled % legacy graded items into cards table', v_count;
END;
$$;