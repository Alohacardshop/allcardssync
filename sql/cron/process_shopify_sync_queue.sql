-- Schedule the Shopify sync queue worker to run every 3 minutes
-- This ensures deferred retries (items with next_retry_at) are picked up
-- after their backoff period expires, and any queued/partial jobs are processed.
--
-- Prerequisites: pg_cron and pg_net extensions must be enabled.
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'process-shopify-sync-queue',
  '*/3 * * * *', -- every 3 minutes
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/process-shopify-sync-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);

-- Verify it was scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'process-shopify-sync-queue';

-- To unschedule:
-- SELECT cron.unschedule('process-shopify-sync-queue');
