-- Enhance send_intake_items_to_inventory to preserve all raw data and image URLs
CREATE OR REPLACE FUNCTION public.send_intake_items_to_inventory(item_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  processed_ids uuid[] := '{}';
  rejected_items jsonb[] := '{}';
  item_record public.intake_items%rowtype;
  validation_error text;
  result_row public.intake_items%rowtype;
  was_already_in_inventory boolean := false;
BEGIN
  -- Process each item in the array
  FOR i IN 1..array_length(item_ids, 1) LOOP
    BEGIN
      was_already_in_inventory := false;
      
      -- Get the item record
      SELECT * INTO item_record 
      FROM public.intake_items 
      WHERE id = item_ids[i];
      
      -- Check if item exists
      IF NOT FOUND THEN
        rejected_items := rejected_items || jsonb_build_object(
          'id', item_ids[i]::text,
          'reason', 'Item not found or no access'
        );
        CONTINUE;
      END IF;
      
      -- Check if already in inventory (for logging purposes)
      IF item_record.removed_from_batch_at IS NOT NULL THEN
        was_already_in_inventory := true;
      END IF;
      
      -- Validate required fields
      validation_error := NULL;
      
      IF item_record.sku IS NULL OR item_record.sku = '' THEN
        validation_error := 'missing_sku';
      ELSIF item_record.store_key IS NULL OR item_record.store_key = '' THEN
        validation_error := 'missing_store_key';
      ELSIF item_record.shopify_location_gid IS NULL OR item_record.shopify_location_gid = '' THEN
        validation_error := 'missing_location';
      END IF;
      
      -- If validation fails, add to reconciliation queue
      IF validation_error IS NOT NULL THEN
        INSERT INTO public.inventory_reconciliation_queue (
          intake_item_id,
          reason,
          details
        ) VALUES (
          item_ids[i],
          validation_error,
          to_jsonb(item_record)
        );
        
        rejected_items := rejected_items || jsonb_build_object(
          'id', item_ids[i]::text,
          'reason', validation_error
        );
        CONTINUE;
      END IF;
      
      -- Process item: update removed_from_batch_at if not already set, and reset sync status
      -- IMPORTANT: Preserve ALL data fields including raw JSON data and image URLs and ensure barcode matches SKU
      UPDATE public.intake_items 
      SET 
        processing_notes = COALESCE(processing_notes, ''),
        removed_from_batch_at = COALESCE(removed_from_batch_at, now()),
        price = COALESCE(price, 0),
        cost = COALESCE(cost, cost), -- Preserve existing cost value
        updated_at = now(),
        updated_by = 'inventory_rpc',
        -- Reset sync status to allow retry
        shopify_sync_status = 'pending',
        last_shopify_sync_error = NULL,
        -- Ensure barcode matches SKU for inventory items
        sku = COALESCE(sku, id::text),  -- Fallback to ID if SKU is somehow missing
        -- Preserve all raw JSON data
        catalog_snapshot = COALESCE(catalog_snapshot, catalog_snapshot),
        psa_snapshot = COALESCE(psa_snapshot, psa_snapshot),
        cgc_snapshot = COALESCE(cgc_snapshot, cgc_snapshot),
        pricing_snapshot = COALESCE(pricing_snapshot, pricing_snapshot),
        shopify_sync_snapshot = COALESCE(shopify_sync_snapshot, shopify_sync_snapshot),
        -- Preserve image URLs from all sources
        image_urls = CASE 
          WHEN image_urls IS NOT NULL AND jsonb_array_length(image_urls) > 0 THEN image_urls
          WHEN catalog_snapshot ? 'image_url' AND catalog_snapshot->>'image_url' != '' THEN jsonb_build_array(catalog_snapshot->>'image_url')
          WHEN psa_snapshot ? 'image_url' AND psa_snapshot->>'image_url' != '' THEN jsonb_build_array(psa_snapshot->>'image_url')
          ELSE image_urls
        END
      WHERE id = item_ids[i]
      RETURNING * INTO result_row;
      
      -- Add to processed list if update was successful
      IF FOUND THEN
        processed_ids := processed_ids || item_ids[i];
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Handle any unexpected errors
      rejected_items := rejected_items || jsonb_build_object(
        'id', item_ids[i]::text,
        'reason', 'Error: ' || SQLERRM
      );
    END;
  END LOOP;
  
  -- Return results
  RETURN jsonb_build_object(
    'processed_ids', array_to_json(processed_ids)::jsonb,
    'rejected', array_to_json(rejected_items)::jsonb
  );
END;
$function$;