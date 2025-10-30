-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule Discord notifications flush at 9am HST (19:00 UTC) daily
SELECT cron.schedule(
  'flush-discord-notifications',
  '0 19 * * *', -- 09:00 HST = 19:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- View job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule (if needed):
-- SELECT cron.unschedule('flush-discord-notifications');
