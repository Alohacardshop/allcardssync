-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule monthly webhook cleanup (runs on the 1st of each month at 2 AM)
-- Cleans webhook events older than 90 days
SELECT cron.schedule(
  'webhook-cleanup-monthly',
  '0 2 1 * *', -- 2 AM on the 1st of every month
  $$
  SELECT scheduled_webhook_cleanup(90, 1000);
  $$
);

-- Optional: Schedule a check to see if emergency cleanup is needed
-- Runs daily at 3 AM and only cleans if more than 50k old events exist
SELECT cron.schedule(
  'webhook-cleanup-emergency',
  '0 3 * * *', -- Daily at 3 AM
  $$
  SELECT CASE 
    WHEN webhook_cleanup_needed(90, 50000) 
    THEN scheduled_webhook_cleanup(90, 1000)
    ELSE NULL
  END;
  $$
);