-- Simply unschedule old cron jobs without error handling
-- This will stop the 401 spam immediately
DO $$
DECLARE
  job_name TEXT;
BEGIN
  -- List of job names to try unscheduling
  FOR job_name IN SELECT unnest(ARRAY[
    'catalog-turbo-worker-mtg',
    'catalog-turbo-worker-pokemon', 
    'catalog-turbo-worker-pokemon-japan',
    'turbo-worker-mtg',
    'turbo-worker-pokemon',
    'turbo-worker-pokemon-japan'
  ])
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Unscheduled job: %', job_name;
    EXCEPTION 
      WHEN OTHERS THEN
        RAISE NOTICE 'Job % not found or already unscheduled', job_name;
    END;
  END LOOP;
END $$;