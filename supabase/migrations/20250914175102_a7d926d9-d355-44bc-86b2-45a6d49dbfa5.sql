-- Fix function search path security issue
CREATE OR REPLACE FUNCTION public.queue_shopify_sync(
  item_id UUID,
  sync_action VARCHAR DEFAULT 'create'
) RETURNS UUID AS $$
DECLARE
  queue_id UUID;
BEGIN
  INSERT INTO public.shopify_sync_queue (
    inventory_item_id,
    action,
    status
  ) VALUES (
    item_id,
    sync_action,
    'queued'
  ) RETURNING id INTO queue_id;
  
  RETURN queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';