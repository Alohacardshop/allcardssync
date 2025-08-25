-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a nightly cron job to sync Pokemon data (30-day lookback)
SELECT cron.schedule(
  'pokemon-catalog-sync-nightly',
  '30 3 * * *', -- Daily at 3:30 AM
  $$
  SELECT
    net.http_post(
      url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/catalog-sync-pokemon?since=' || (CURRENT_DATE - INTERVAL '30 days')::text,
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);