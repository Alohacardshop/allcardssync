-- Safely unschedule existing cron jobs (ignore if they don't exist)
DO $$
BEGIN
  -- Try to unschedule each job, ignore errors if job doesn't exist
  BEGIN
    PERFORM cron.unschedule('catalog-turbo-worker-mtg');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error
  END;
  
  BEGIN
    PERFORM cron.unschedule('catalog-turbo-worker-pokemon');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('catalog-turbo-worker-pokemon-japan');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('turbo-worker-mtg');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('turbo-worker-pokemon');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('turbo-worker-pokemon-japan');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Set the cron shared token as a database setting
SELECT set_config('app.cron_shared_token', current_setting('CRON_SHARED_TOKEN', false), false);

-- Schedule new secure cron jobs that call the proxy (every 10 minutes)
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