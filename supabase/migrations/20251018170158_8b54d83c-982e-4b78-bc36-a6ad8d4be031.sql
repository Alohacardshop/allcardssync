-- Create batch queue function for efficient bulk syncing
CREATE OR REPLACE FUNCTION public.batch_queue_shopify_sync(
  item_ids UUID[],
  sync_action VARCHAR DEFAULT 'update'
)
RETURNS TABLE(queued_count INT, failed_count INT) AS $$
DECLARE
  queued INT := 0;
  failed INT := 0;
  item_id UUID;
  next_pos INT;
BEGIN
  -- Get starting position
  SELECT COALESCE(MAX(queue_position), 0) INTO next_pos
  FROM public.shopify_sync_queue;
  
  -- Loop through items
  FOREACH item_id IN ARRAY item_ids LOOP
    BEGIN
      next_pos := next_pos + 1;
      INSERT INTO public.shopify_sync_queue (
        inventory_item_id,
        action,
        status,
        queue_position
      ) VALUES (
        item_id,
        sync_action,
        'queued',
        next_pos
      );
      queued := queued + 1;
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT queued, failed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';