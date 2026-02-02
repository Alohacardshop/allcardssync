-- First, drop the existing once-daily cron job
SELECT cron.unschedule('flush-discord-notifications-daily');

-- Create a new cron job that runs every 10 minutes
-- The flush function itself handles business hours checking per region
SELECT cron.schedule(
  'flush-discord-notifications',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
      body := '{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);