-- A) Set INVENTORY_SYNC_MODE default to 'auto' and update existing manual settings
INSERT INTO system_settings (key_name, key_value, description, category)
VALUES ('INVENTORY_SYNC_MODE', 'auto', 'Inventory sync mode: auto or manual', 'shopify')
ON CONFLICT (key_name) 
DO UPDATE SET 
  key_value = CASE 
    WHEN system_settings.key_value = 'manual' THEN 'auto'
    ELSE system_settings.key_value 
  END,
  updated_at = now();

-- C) Add sold tracking columns to intake_items
ALTER TABLE intake_items 
  ADD COLUMN IF NOT EXISTS sold_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

-- A) Update is_inventory_sync_enabled function to default to 'auto'
CREATE OR REPLACE FUNCTION public.is_inventory_sync_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT key_value FROM system_settings WHERE key_name = 'INVENTORY_SYNC_MODE'),
    'auto'
  ) = 'auto';
$function$;

-- E) Update trigger to add guardrails for sold items
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sync_payload jsonb;
  is_excluded_item boolean := false;
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

  -- E) Guardrail: Skip sync for sold items (quantity = 0 and sold_at is set)
  IF tg_op != 'DELETE' AND new.quantity = 0 AND new.sold_at IS NOT NULL THEN
    RETURN new;
  END IF;

  -- Check if item should be excluded from Shopify sync (bulk cards and other items)
  IF tg_op = 'DELETE' THEN
    is_excluded_item := old.variant = 'Bulk' OR 
                       old.variant = 'Other' OR
                       (old.catalog_snapshot IS NOT NULL AND 
                        (old.catalog_snapshot->>'type' = 'card_bulk' OR
                         old.catalog_snapshot->>'type' = 'other_item'));
  ELSE
    is_excluded_item := new.variant = 'Bulk' OR 
                       new.variant = 'Other' OR
                       (new.catalog_snapshot IS NOT NULL AND 
                        (new.catalog_snapshot->>'type' = 'card_bulk' OR
                         new.catalog_snapshot->>'type' = 'other_item'));
  END IF;

  -- Skip Shopify sync for excluded items (bulk cards and other items)
  IF is_excluded_item THEN
    IF tg_op = 'DELETE' THEN
      RETURN old;
    ELSE
      RETURN new;
    END IF;
  END IF;

  -- Rest of function remains the same for non-excluded items
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