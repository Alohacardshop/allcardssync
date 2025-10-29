-- Recreate send_intake_items_to_inventory RPC function
-- Now returns processed_ids array and rejected array for accurate frontend tracking

CREATE OR REPLACE FUNCTION public.send_intake_items_to_inventory(item_ids uuid[])
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
      -- Update the item: set removed_from_batch_at to mark it as sent to inventory
      UPDATE public.intake_items
      SET 
        removed_from_batch_at = now(),
        updated_at = now(),
        updated_by = auth.uid()::text
      WHERE id = item_id
        AND deleted_at IS NULL
        AND removed_from_batch_at IS NULL;

      -- Track success or failure
      IF FOUND THEN
        processed_ids := array_append(processed_ids, item_id);
      ELSE
        rejected := rejected || jsonb_build_object(
          'id', item_id,
          'reason', 'Item not found or already processed'
        );
      END IF;

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

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Successfully recreated send_intake_items_to_inventory RPC';
  RAISE NOTICE 'Function now returns processed_ids array and rejected array';
END $$;
