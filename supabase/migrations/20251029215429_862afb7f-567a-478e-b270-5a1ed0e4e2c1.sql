-- Fix send_and_queue_inventory: Correct ON CONFLICT clause to match actual unique index
-- The unique index is: (inventory_item_id, action) WHERE status IN ('queued','processing')
-- Previous incorrect: ON CONFLICT (inventory_item_id)
-- Fixed: ON CONFLICT (inventory_item_id, action) WHERE status IN ('queued','processing')

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
  v_item record;
  v_err text;
BEGIN
  FOREACH item_id IN ARRAY item_ids LOOP
    BEGIN
      -- Lock and check eligibility
      SELECT * INTO v_item
      FROM public.intake_items
      WHERE id = item_id
        AND deleted_at IS NULL
        AND removed_from_batch_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        rejected := rejected || jsonb_build_object('id', item_id, 'reason', 'Item not found or already processed');
        CONTINUE;
      END IF;

      -- Mark item as sent to inventory
      UPDATE public.intake_items
      SET removed_from_batch_at = now(),
          updated_at = now(),
          updated_by = auth.uid()::text
      WHERE id = item_id;

      -- Queue for Shopify sync (idempotent upsert)
      -- FIXED: Match the actual unique index (inventory_item_id, action) with WHERE clause
      INSERT INTO public.shopify_sync_queue (inventory_item_id, action, status, retry_count, max_retries)
      VALUES (
        item_id,
        CASE WHEN COALESCE(v_item.shopify_product_id,'') <> '' THEN 'update' ELSE 'create' END,
        'queued',
        0,
        3
      )
      ON CONFLICT (inventory_item_id, action) 
      WHERE status IN ('queued','processing')
      DO UPDATE SET 
        status = 'queued',
        retry_count = 0,
        updated_at = now();

      processed_ids := array_append(processed_ids, item_id);

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      rejected := rejected || jsonb_build_object('id', item_id, 'reason', v_err);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', COALESCE(array_length(processed_ids,1),0),
    'processed_ids', processed_ids,
    'rejected', rejected
  );
END;
$function$;

-- Add documentation
COMMENT ON FUNCTION public.send_and_queue_inventory(uuid[]) IS 
'✅ PRODUCTION READY - FIXED 2025-10-29
Atomic operation: marks items as removed from batch AND queues for Shopify sync.
- Updates intake_items.removed_from_batch_at
- Inserts/updates shopify_sync_queue with correct conflict handling
- Returns: { processed: int, processed_ids: uuid[], rejected: [{id, reason}] }
FIXED: ON CONFLICT now correctly matches unique index (inventory_item_id, action) WHERE status IN (queued, processing)';