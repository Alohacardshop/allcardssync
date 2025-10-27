-- Create function to cleanup old webhook events
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.webhook_events
  WHERE created_at < (now() - (retention_days || ' days')::interval);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup action
  INSERT INTO public.system_logs (level, message, context)
  VALUES (
    'info',
    'Webhook events cleanup completed',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'retention_days', retention_days
    )
  );
  
  RETURN deleted_count;
END;
$$;

-- Schedule daily cleanup at 2 AM UTC
SELECT cron.schedule(
  'cleanup-old-webhook-events',
  '0 2 * * *', -- Every day at 2 AM
  $$
  SELECT public.cleanup_old_webhook_events(90);
  $$
);