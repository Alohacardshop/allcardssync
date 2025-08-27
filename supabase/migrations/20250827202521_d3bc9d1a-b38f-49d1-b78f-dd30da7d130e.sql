-- Create a scheduled job to run the turbo worker every minute for active syncs
-- This will automatically process queues in the background

-- First enable the pg_cron extension if not already enabled
SELECT cron.schedule(
  'catalog-turbo-worker-mtg',
  '* * * * *', 
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/catalog-turbo-worker?mode=mtg&concurrency=3&batches=10&batchSize=5',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule for pokemon mode
SELECT cron.schedule(
  'catalog-turbo-worker-pokemon',
  '* * * * *', 
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/catalog-turbo-worker?mode=pokemon&concurrency=3&batches=10&batchSize=5',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule for pokemon-japan mode
SELECT cron.schedule(
  'catalog-turbo-worker-pokemon-japan',
  '* * * * *', 
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/catalog-turbo-worker?mode=pokemon-japan&concurrency=3&batches=10&batchSize=5',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);