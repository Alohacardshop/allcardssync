-- Update the manage_justtcg_cron_jobs function to use daily-set-discovery instead
CREATE OR REPLACE FUNCTION public.manage_justtcg_cron_jobs(action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  discovery_job_sql text;
BEGIN
  -- Use the new daily-set-discovery function
  discovery_job_sql := 'SELECT net.http_post(url := ''https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/daily-set-discovery'', headers := ''"{"Content-Type":"application/json"}"''::jsonb, body := ''{}'');';

  IF action = 'enable' THEN
    -- Enable daily discovery (2 AM daily UTC)
    PERFORM cron.schedule('justtcg-daily-discovery', '0 2 * * *', discovery_job_sql);
    
    RETURN 'JustTCG daily set discovery enabled at 2 AM UTC';
    
  ELSIF action = 'disable' THEN
    PERFORM cron.unschedule('justtcg-daily-discovery');
    PERFORM cron.unschedule('justtcg-weekly-sync'); -- Remove old weekly sync too
    PERFORM cron.unschedule('justtcg-nightly-discovery'); -- Remove old nightly discovery too
    
    RETURN 'JustTCG cron jobs disabled';
    
  ELSIF action = 'status' THEN
    RETURN (
      SELECT COALESCE('Daily discovery: ' || jobname, 'Daily discovery: not scheduled')
      FROM cron.job 
      WHERE jobname = 'justtcg-daily-discovery' 
      LIMIT 1
    );
    
  ELSE
    RETURN 'Invalid action. Use "enable", "disable", or "status"';
  END IF;
END;
$function$;