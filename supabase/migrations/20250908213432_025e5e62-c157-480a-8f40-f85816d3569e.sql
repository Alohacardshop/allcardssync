-- Update trigger function to skip Shopify sync for bulk items
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sync_payload jsonb;
  is_bulk_item boolean := false;
BEGIN
  -- Check if automatic sync is enabled
  IF NOT public.is_inventory_sync_enabled() THEN
    -- In manual mode, just return without syncing
    IF tg_op = 'DELETE' THEN
      RETURN old;
    ELSE
      RETURN new;
    END IF;
  END IF;

  -- Check if item is bulk (should skip Shopify sync)
  IF tg_op = 'DELETE' THEN
    is_bulk_item := old.variant = 'Bulk' OR 
                   (old.catalog_snapshot IS NOT NULL AND 
                    old.catalog_snapshot->>'type' = 'card_bulk');
  ELSE
    is_bulk_item := new.variant = 'Bulk' OR 
                   (new.catalog_snapshot IS NOT NULL AND 
                    new.catalog_snapshot->>'type' = 'card_bulk');
  END IF;

  -- Skip Shopify sync for bulk items
  IF is_bulk_item THEN
    IF tg_op = 'DELETE' THEN
      RETURN old;
    ELSE
      RETURN new;
    END IF;
  END IF;

  -- Rest of function remains the same for non-bulk items
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
$$;