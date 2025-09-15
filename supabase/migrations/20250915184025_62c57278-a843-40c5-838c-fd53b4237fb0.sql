-- Add queue_position field to shopify_sync_queue table for guaranteed ordering
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN queue_position SERIAL;

-- Add processor_id field to track which instance is processing
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN processor_id UUID DEFAULT NULL;

-- Add heartbeat field to detect stuck processors
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN processor_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add retry_after field for better retry handling
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN retry_after TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient queue processing
CREATE INDEX idx_shopify_sync_queue_position ON public.shopify_sync_queue(queue_position) WHERE status = 'queued';

-- Migrate existing records to have positions based on created_at
WITH ordered_items AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_position
  FROM public.shopify_sync_queue
  WHERE status = 'queued'
)
UPDATE public.shopify_sync_queue 
SET queue_position = ordered_items.new_position + COALESCE(
  (SELECT MAX(queue_position) FROM public.shopify_sync_queue WHERE queue_position IS NOT NULL), 0
)
FROM ordered_items 
WHERE public.shopify_sync_queue.id = ordered_items.id;

-- Update the queue_shopify_sync RPC function to assign sequential positions
CREATE OR REPLACE FUNCTION public.queue_shopify_sync(item_id uuid, sync_action character varying DEFAULT 'create'::character varying)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  queue_id UUID;
  next_position INTEGER;
BEGIN
  -- Get the next position in the queue
  SELECT COALESCE(MAX(queue_position), 0) + 1 
  INTO next_position 
  FROM public.shopify_sync_queue;
  
  INSERT INTO public.shopify_sync_queue (
    inventory_item_id,
    action,
    status,
    queue_position
  ) VALUES (
    item_id,
    sync_action,
    'queued',
    next_position
  ) RETURNING id INTO queue_id;
  
  RETURN queue_id;
END;
$function$;

-- Create function to check if processor is running (distributed lock)
CREATE OR REPLACE FUNCTION public.acquire_shopify_processor_lock(processor_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  lock_acquired BOOLEAN := false;
BEGIN
  -- Try to acquire advisory lock
  SELECT pg_try_advisory_lock(hashtext('shopify_processor_lock')) INTO lock_acquired;
  
  IF lock_acquired THEN
    -- Update system settings to track active processor
    INSERT INTO public.system_settings (key_name, key_value, description, category)
    VALUES (
      'SHOPIFY_PROCESSOR_ACTIVE',
      processor_instance_id::text,
      'Active Shopify processor instance ID',
      'system'
    )
    ON CONFLICT (key_name) 
    DO UPDATE SET 
      key_value = processor_instance_id::text,
      updated_at = now();
  END IF;
  
  RETURN lock_acquired;
END;
$function$;

-- Create function to release processor lock
CREATE OR REPLACE FUNCTION public.release_shopify_processor_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Release advisory lock
  PERFORM pg_advisory_unlock(hashtext('shopify_processor_lock'));
  
  -- Clear active processor setting
  DELETE FROM public.system_settings 
  WHERE key_name = 'SHOPIFY_PROCESSOR_ACTIVE';
  
  RETURN true;
END;
$function$;