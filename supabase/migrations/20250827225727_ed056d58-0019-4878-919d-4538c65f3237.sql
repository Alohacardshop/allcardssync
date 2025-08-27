-- Add cron jobs for JustTCG discovery and sync
-- Note: These are optional and can be enabled by uncommenting

-- Nightly discovery job (runs at 2 AM daily)
-- This keeps games and sets fresh by discovering new content
-- SELECT cron.schedule(
--   'justtcg-nightly-discovery',
--   '0 2 * * *',  -- At 2:00 AM daily
--   $$
--   SELECT net.http_post(
--     url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-games',
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );
--   SELECT net.http_post(
--     url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-sets',
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );
--   $$
-- );

-- Weekly rolling sync (runs on Sundays at 3 AM)
-- This syncs all sets to keep card data up to date
-- SELECT cron.schedule(
--   'justtcg-weekly-sync',
--   '0 3 * * 0',  -- At 3:00 AM every Sunday
--   $$
--   SELECT net.http_post(
--     url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg-import',
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );
--   $$
-- );

-- To enable these jobs, uncomment the above SELECT statements
-- To see existing cron jobs: SELECT * FROM cron.job;
-- To unschedule: SELECT cron.unschedule('job-name');

-- Create a function to manually enable/disable cron jobs
CREATE OR REPLACE FUNCTION manage_justtcg_cron_jobs(action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF action = 'enable' THEN
    -- Enable nightly discovery
    PERFORM cron.schedule(
      'justtcg-nightly-discovery',
      '0 2 * * *',
      $$
      SELECT net.http_post(
        url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-games',
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      SELECT net.http_post(
        url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-sets',
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      $$
    );
    
    -- Enable weekly sync
    PERFORM cron.schedule(
      'justtcg-weekly-sync',
      '0 3 * * 0',
      $$
      SELECT net.http_post(
        url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg-import',
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      $$
    );
    
    RETURN 'JustTCG cron jobs enabled';
    
  ELSIF action = 'disable' THEN
    PERFORM cron.unschedule('justtcg-nightly-discovery');
    PERFORM cron.unschedule('justtcg-weekly-sync');
    
    RETURN 'JustTCG cron jobs disabled';
    
  ELSE
    RETURN 'Invalid action. Use "enable" or "disable"';
  END IF;
END;
$$;