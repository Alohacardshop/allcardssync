-- 1. Create reconciliation table for invalid items
CREATE TABLE public.inventory_reconciliation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_item_id uuid NOT NULL,
  reason text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on reconciliation table
ALTER TABLE public.inventory_reconciliation_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for reconciliation table
CREATE POLICY "Admins can manage reconciliation queue" 
ON public.inventory_reconciliation_queue 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view reconciliation queue" 
ON public.inventory_reconciliation_queue 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Add updated_by column to intake_items for loop prevention
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS updated_by text;

-- 3. Create unified batch RPC for sending items to inventory
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
BEGIN
  -- Process each item in the array
  FOR i IN 1..array_length(item_ids, 1) LOOP
    BEGIN
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
      
      -- Skip if already processed (idempotency)
      IF item_record.removed_from_batch_at IS NOT NULL THEN
        CONTINUE;
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
      
      -- Process valid item: update removed_from_batch_at
      UPDATE public.intake_items 
      SET 
        processing_notes = COALESCE(processing_notes, ''),
        removed_from_batch_at = now(),
        price = COALESCE(price, 0),
        updated_at = now(),
        updated_by = 'inventory_rpc'
      WHERE id = item_ids[i]
        AND removed_from_batch_at IS NULL -- Double-check idempotency
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

-- 4. Update trigger to ignore webhook updates for loop prevention
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sync_payload jsonb;
  validate_payload jsonb;
  is_excluded_item boolean := false;
BEGIN
  -- Skip if updated by webhook (loop prevention)
  IF TG_OP != 'DELETE' AND NEW.updated_by = 'shopify_webhook' THEN
    RETURN NEW;
  END IF;

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
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Auth', public.get_decrypted_secret('INTERNAL_SYNC_SECRET')
          ),
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
      -- First, perform validation-only call to catch errors early
      validate_payload := jsonb_build_object(
        'storeKey', new.store_key,
        'sku', new.sku,
        'locationGid', new.shopify_location_gid,
        'validateOnly', true
      );
      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Auth', public.get_decrypted_secret('INTERNAL_SYNC_SECRET')
          ),
          body    := validate_payload
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Shopify validation failed: %', SQLERRM;
        -- Continue with the actual sync even if validation fails
      END;

      -- Sync the current (new) state
      sync_payload := jsonb_build_object(
        'storeKey', new.store_key,
        'sku', new.sku,
        'locationGid', new.shopify_location_gid
      );
      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Auth', public.get_decrypted_secret('INTERNAL_SYNC_SECRET')
          ),
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
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'X-Internal-Auth', public.get_decrypted_secret('INTERNAL_SYNC_SECRET')
            ),
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