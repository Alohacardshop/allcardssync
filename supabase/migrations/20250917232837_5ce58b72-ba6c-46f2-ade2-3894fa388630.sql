-- Create a function to trigger the Shopify sync processor
CREATE OR REPLACE FUNCTION trigger_shopify_sync_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if there are queued items and no active processor
  IF EXISTS (
    SELECT 1 FROM shopify_sync_queue 
    WHERE status = 'queued' 
    AND (retry_after IS NULL OR retry_after <= now())
  ) THEN
    -- Use pg_notify to signal that processor should run
    PERFORM pg_notify('shopify_sync_trigger', 'process_queue');
  END IF;
END;
$$;

-- Create a trigger that automatically calls the processor when items are queued
CREATE OR REPLACE FUNCTION auto_trigger_shopify_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only trigger on INSERT of queued items or UPDATE to queued status
  IF (TG_OP = 'INSERT' AND NEW.status = 'queued') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'queued' AND NEW.status = 'queued') THEN
    
    -- Schedule the processor trigger function to run asynchronously
    PERFORM trigger_shopify_sync_processor();
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the trigger on the shopify_sync_queue table
DROP TRIGGER IF EXISTS shopify_sync_queue_auto_trigger ON shopify_sync_queue;
CREATE TRIGGER shopify_sync_queue_auto_trigger
  AFTER INSERT OR UPDATE ON shopify_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION auto_trigger_shopify_sync();

-- Add a function to manually trigger the processor
CREATE OR REPLACE FUNCTION manual_trigger_shopify_processor()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Trigger the notification
  PERFORM pg_notify('shopify_sync_trigger', 'manual_trigger');
  
  result := json_build_object(
    'success', true,
    'message', 'Shopify sync processor trigger sent'
  );
  
  RETURN result;
END;
$$;