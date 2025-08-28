-- Unschedule existing cron jobs that cause 401 errors
SELECT cron.unschedule('catalog-turbo-worker-mtg');
SELECT cron.unschedule('catalog-turbo-worker-pokemon');
SELECT cron.unschedule('catalog-turbo-worker-pokemon-japan');
SELECT cron.unschedule('turbo-worker-mtg');
SELECT cron.unschedule('turbo-worker-pokemon');
SELECT cron.unschedule('turbo-worker-pokemon-japan');

-- Schedule new cron jobs that call the secure proxy (every 10 minutes)
SELECT cron.schedule(
  'catalog-cron-proxy-mtg',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-cron-proxy?mode=mtg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_shared_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'catalog-cron-proxy-pokemon',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-cron-proxy?mode=pokemon',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_shared_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'catalog-cron-proxy-pokemon-japan',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-cron-proxy?mode=pokemon-japan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_shared_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);