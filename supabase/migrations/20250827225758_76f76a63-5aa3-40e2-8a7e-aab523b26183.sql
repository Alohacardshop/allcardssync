-- Create a function to manually enable/disable JustTCG cron jobs
CREATE OR REPLACE FUNCTION manage_justtcg_cron_jobs(action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  discovery_job_sql text;
  sync_job_sql text;
BEGIN
  discovery_job_sql := 'SELECT net.http_post(url := ''https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-games'', headers := ''"{"Content-Type":"application/json"}"''::jsonb); SELECT net.http_post(url := ''https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/discover-sets'', headers := ''"{"Content-Type":"application/json"}"''::jsonb);';
  
  sync_job_sql := 'SELECT net.http_post(url := ''https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg-import'', headers := ''"{"Content-Type":"application/json"}"''::jsonb);';

  IF action = 'enable' THEN
    -- Enable nightly discovery (2 AM daily)
    PERFORM cron.schedule('justtcg-nightly-discovery', '0 2 * * *', discovery_job_sql);
    
    -- Enable weekly sync (3 AM Sundays)
    PERFORM cron.schedule('justtcg-weekly-sync', '0 3 * * 0', sync_job_sql);
    
    RETURN 'JustTCG cron jobs enabled: nightly discovery at 2 AM, weekly sync on Sundays at 3 AM';
    
  ELSIF action = 'disable' THEN
    PERFORM cron.unschedule('justtcg-nightly-discovery');
    PERFORM cron.unschedule('justtcg-weekly-sync');
    
    RETURN 'JustTCG cron jobs disabled';
    
  ELSIF action = 'status' THEN
    RETURN (
      SELECT 'Discovery: ' || COALESCE(jobname, 'not scheduled') || ', Sync: ' || COALESCE(j2.jobname, 'not scheduled')
      FROM (SELECT jobname FROM cron.job WHERE jobname = 'justtcg-nightly-discovery' LIMIT 1) j
      FULL OUTER JOIN (SELECT jobname FROM cron.job WHERE jobname = 'justtcg-weekly-sync' LIMIT 1) j2 ON true
    );
    
  ELSE
    RETURN 'Invalid action. Use "enable", "disable", or "status"';
  END IF;
END;
$$;

-- Grant execute permission to admins
GRANT EXECUTE ON FUNCTION manage_justtcg_cron_jobs(text) TO postgres;