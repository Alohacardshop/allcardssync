-- Create a cron job to flush pending Discord notifications every day at 9am HST (7pm UTC)
SELECT cron.schedule(
  'flush-discord-notifications-daily',
  '0 19 * * *', -- 7pm UTC = 9am HST (Hawaii is UTC-10)
  $$
  SELECT
    net.http_post(
      url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/flush-pending-notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
      body := '{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);