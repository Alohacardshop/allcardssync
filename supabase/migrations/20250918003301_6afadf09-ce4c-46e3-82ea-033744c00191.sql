-- Update trigger function to process single items only
CREATE OR REPLACE FUNCTION trigger_shopify_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the shopify-sync edge function for the specific item only
  PERFORM net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body := jsonb_build_object(
      'trigger', 'auto',
      'single_item_id', NEW.id::text
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;