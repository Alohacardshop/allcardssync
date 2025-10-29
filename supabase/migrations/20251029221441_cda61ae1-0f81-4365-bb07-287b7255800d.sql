-- Fix send_and_queue_inventory to use correct shopify_sync_queue column names
-- Resolves: column 'intake_item_id' does not exist error

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
  error_msg text;
BEGIN
  -- Process each item
  FOREACH item_id IN ARRAY item_ids LOOP
    BEGIN
      -- Verify item exists and is not already processed
      IF NOT EXISTS (
        SELECT 1 FROM public.intake_items
        WHERE id = item_id
          AND deleted_at IS NULL
          AND removed_from_batch_at IS NULL
      ) THEN
        rejected := rejected || jsonb_build_object(
          'id', item_id,
          'reason', 'Item not found or already processed'
        );
        CONTINUE;
      END IF;

      -- Insert into shopify_sync_queue with CORRECT column names
      INSERT INTO public.shopify_sync_queue (
        inventory_item_id,  -- ✅ Correct column name
        action,             -- ✅ Required field
        status,
        retry_count,
        max_retries
      ) VALUES (
        item_id,
        'upsert',           -- Default action for inventory sync
        'queued',           -- Initial status
        0,                  -- Start with 0 retries
        3                   -- Max 3 retry attempts
      );

      -- Update intake_items: mark as removed from batch
      UPDATE public.intake_items
      SET 
        removed_from_batch_at = now(),
        updated_at = now(),
        updated_by = COALESCE(auth.uid()::text, updated_by)
      WHERE id = item_id;

      -- Track successful processing
      processed_ids := array_append(processed_ids, item_id);

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
      rejected := rejected || jsonb_build_object(
        'id', item_id,
        'reason', error_msg
      );
    END;
  END LOOP;
  
  -- Return summary with processed_ids array
  RETURN jsonb_build_object(
    'processed', COALESCE(array_length(processed_ids, 1), 0),
    'processed_ids', processed_ids,
    'rejected', rejected
  );
END;
$function$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.send_and_queue_inventory(uuid[]) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed send_and_queue_inventory with correct shopify_sync_queue schema';
  RAISE NOTICE '   - Using inventory_item_id instead of intake_item_id';
  RAISE NOTICE '   - Removed invalid store_key and location_gid columns';
  RAISE NOTICE '   - Added required action and max_retries fields';
END $$;