-- Drop and recreate send_and_queue_inventory to force recompilation with current schema
-- This resolves the "record 'new' has no field 'updated_by'" error

DROP FUNCTION IF EXISTS public.send_and_queue_inventory(uuid[]);

CREATE OR REPLACE FUNCTION public.send_and_queue_inventory(item_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  processed_ids uuid[] := ARRAY[]::uuid[];
  rejected jsonb := '[]'::jsonb;
  item_id uuid;
  item_record record;
  queue_id uuid;
  error_msg text;
BEGIN
  -- Process each item
  FOREACH item_id IN ARRAY item_ids LOOP
    BEGIN
      -- Get the item details
      SELECT * INTO item_record
      FROM public.intake_items
      WHERE id = item_id
        AND deleted_at IS NULL
        AND removed_from_batch_at IS NULL;

      IF NOT FOUND THEN
        rejected := rejected || jsonb_build_object(
          'id', item_id,
          'reason', 'Item not found or already processed'
        );
        CONTINUE;
      END IF;

      -- Insert into shopify_sync_queue
      INSERT INTO public.shopify_sync_queue (
        intake_item_id,
        store_key,
        location_gid,
        status,
        retry_count,
        last_error
      ) VALUES (
        item_id,
        item_record.store_key,
        item_record.location_gid,
        'pending',
        0,
        NULL
      )
      RETURNING id INTO queue_id;

      -- Update intake_items: mark as removed from batch
      UPDATE public.intake_items
      SET 
        removed_from_batch_at = now(),
        updated_at = now(),
        updated_by = COALESCE(auth.uid()::text, updated_by)
      WHERE id = item_id;

      processed_ids := array_append(processed_ids, item_id);

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
      rejected := rejected || jsonb_build_object(
        'id', item_id,
        'reason', error_msg
      );
    END;
  END LOOP;
  
  -- Return summary
  RETURN jsonb_build_object(
    'processed', COALESCE(array_length(processed_ids, 1), 0),
    'processed_ids', processed_ids,
    'rejected', rejected
  );
END;
$function$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Recreated send_and_queue_inventory with fresh schema cache';
END $$;