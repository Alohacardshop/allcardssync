-- Fix send_intake_items_to_inventory to run in read-write mode
-- This resolves "cannot execute UPDATE in a read-only transaction" errors
-- Using VOLATILE keyword to ensure function can modify data

CREATE OR REPLACE FUNCTION public.send_intake_items_to_inventory(item_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE  -- Explicitly mark as volatile (modifies data)
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
  failed_items jsonb := '[]'::jsonb;
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
        updated_at = now()
      WHERE id = item_id
        AND deleted_at IS NULL
        AND removed_from_batch_at IS NULL;
      
      IF FOUND THEN
        processed_count := processed_count + 1;
      ELSE
        failed_count := failed_count + 1;
        failed_items := failed_items || jsonb_build_object(
          'id', item_id,
          'error', 'Item not found or already processed'
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      failed_count := failed_count + 1;
      GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
      failed_items := failed_items || jsonb_build_object(
        'id', item_id,
        'error', error_msg
      );
    END;
  END LOOP;
  
  -- Return summary
  RETURN jsonb_build_object(
    'processed', processed_count,
    'failed', failed_count,
    'failed_items', failed_items
  );
END;
$function$;