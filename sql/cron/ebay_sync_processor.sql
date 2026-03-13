-- Schedule the eBay sync processor to run every 1 minute
-- Combined with self-chaining, this mostly serves as a reliability fallback.
--
-- Prerequisites: pg_cron and pg_net extensions must be enabled.
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- First, unschedule the old 3-minute job if it exists:
-- SELECT cron.unschedule('ebay-sync-processor');

SELECT cron.schedule(
  'ebay-sync-processor',
  '* * * * *', -- every 1 minute
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/ebay-sync-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);

-- Verify it was scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'ebay-sync-processor';

-- To unschedule:
-- SELECT cron.unschedule('ebay-sync-processor');
