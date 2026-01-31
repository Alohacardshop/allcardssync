-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule Discord notifications flush at 9am HST (19:00 UTC) daily for Hawaii
-- Note: Las Vegas would need a separate job if different timing is needed
SELECT cron.schedule(
  'flush-discord-notifications',
  '0 19 * * *', -- 09:00 HST = 19:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Optional: Schedule a separate flush for Las Vegas at 10am PST (18:00 UTC) if needed
-- SELECT cron.schedule(
--   'flush-discord-notifications-vegas',
--   '0 18 * * *', -- 10:00 PST = 18:00 UTC
--   $$
--   SELECT net.http_post(
--     url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
--     body := '{"region": "las_vegas"}'::jsonb
--   ) as request_id;
--   $$
-- );

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- View job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule (if needed):
-- SELECT cron.unschedule('flush-discord-notifications');
-- SELECT cron.unschedule('flush-discord-notifications-vegas');
