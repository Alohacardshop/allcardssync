-- Fix send_and_queue_inventory to use correct action values per CHECK constraint
-- Constraint allows: 'create', 'update', 'delete' (NOT 'upsert')

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

      -- Insert into shopify_sync_queue with correct action based on existing Shopify product
      INSERT INTO public.shopify_sync_queue (
        inventory_item_id,
        action,             -- 'create' or 'update' based on shopify_product_id
        status,
        retry_count,
        max_retries
      ) VALUES (
        item_id,
        CASE 
          WHEN item_record.shopify_product_id IS NOT NULL THEN 'update'
          ELSE 'create'
        END,
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
  RAISE NOTICE '✅ Fixed send_and_queue_inventory with correct action values';
  RAISE NOTICE '   - Using create/update instead of upsert';
  RAISE NOTICE '   - Action determined by shopify_product_id presence';
END $$;