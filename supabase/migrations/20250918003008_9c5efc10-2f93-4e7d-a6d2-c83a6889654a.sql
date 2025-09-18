-- Drop existing function first
DROP FUNCTION IF EXISTS trigger_shopify_sync();

-- Enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger shopify sync
CREATE OR REPLACE FUNCTION trigger_shopify_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the shopify-sync edge function asynchronously
  PERFORM net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body := '{"trigger": "auto"}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on shopify_sync_queue table
DROP TRIGGER IF EXISTS auto_process_shopify_queue ON shopify_sync_queue;
CREATE TRIGGER auto_process_shopify_queue
  AFTER INSERT ON shopify_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_shopify_sync();