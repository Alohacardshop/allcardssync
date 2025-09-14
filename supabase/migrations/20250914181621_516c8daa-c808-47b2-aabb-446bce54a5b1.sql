-- Create queue cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_shopify_sync_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cleanup_days integer;
  archive_days integer;
BEGIN
  -- Get cleanup settings
  SELECT 
    COALESCE((SELECT key_value FROM system_settings WHERE key_name = 'SHOPIFY_AUTO_CLEANUP_DAYS'), '7')::integer,
    COALESCE((SELECT key_value FROM system_settings WHERE key_name = 'SHOPIFY_AUTO_ARCHIVE_DAYS'), '30')::integer
  INTO cleanup_days, archive_days;

  -- Delete completed items older than cleanup_days
  DELETE FROM shopify_sync_queue 
  WHERE status = 'completed' 
    AND completed_at < (now() - (cleanup_days || ' days')::interval);

  -- Archive (mark as archived) failed items older than archive_days
  UPDATE shopify_sync_queue 
  SET error_message = COALESCE(error_message, '') || ' [ARCHIVED]'
  WHERE status = 'failed' 
    AND created_at < (now() - (archive_days || ' days')::interval)
    AND error_message NOT LIKE '%[ARCHIVED]%';

  -- Log cleanup activity
  INSERT INTO system_logs (level, message, context)
  VALUES (
    'info',
    'Automatic queue cleanup completed',
    jsonb_build_object(
      'cleanup_days', cleanup_days,
      'archive_days', archive_days,
      'timestamp', now()
    )
  );
END;
$function$;

-- Create health check function
CREATE OR REPLACE FUNCTION public.check_shopify_queue_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  health_report jsonb;
  total_items integer;
  queued_items integer;
  failed_items integer;
  processing_items integer;
  failure_rate numeric;
  last_processor_run timestamp with time zone;
  health_score integer := 100;
  alerts jsonb := '[]'::jsonb;
BEGIN
  -- Get queue statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'queued'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'processing')
  INTO total_items, queued_items, failed_items, processing_items
  FROM shopify_sync_queue;

  -- Calculate failure rate
  IF total_items > 0 THEN
    failure_rate := (failed_items::numeric / total_items::numeric) * 100;
  ELSE
    failure_rate := 0;
  END IF;

  -- Find last processor run
  SELECT completed_at 
    INTO last_processor_run
  FROM shopify_sync_queue 
  WHERE status = 'completed' AND completed_at IS NOT NULL
  ORDER BY completed_at DESC 
  LIMIT 1;

  -- Health scoring and alerts
  IF failure_rate > 20 THEN
    health_score := health_score - 40;
    alerts := alerts || jsonb_build_object(
      'type', 'critical',
      'message', 'High failure rate: ' || failure_rate::text || '%'
    );
  ELSIF failure_rate > 10 THEN
    health_score := health_score - 20;
    alerts := alerts || jsonb_build_object(
      'type', 'warning', 
      'message', 'Elevated failure rate: ' || failure_rate::text || '%'
    );
  END IF;

  IF queued_items > 100 THEN
    health_score := health_score - 20;
    alerts := alerts || jsonb_build_object(
      'type', 'warning',
      'message', 'Large queue backlog: ' || queued_items::text || ' items'
    );
  END IF;

  IF last_processor_run IS NULL OR last_processor_run < (now() - interval '1 hour') THEN
    health_score := health_score - 30;
    alerts := alerts || jsonb_build_object(
      'type', 'critical',
      'message', 'Processor has not run recently'
    );
  END IF;

  -- Build health report
  health_report := jsonb_build_object(
    'timestamp', now(),
    'health_score', GREATEST(0, health_score),
    'total_items', total_items,
    'queued_items', queued_items,
    'failed_items', failed_items,
    'processing_items', processing_items,
    'failure_rate', failure_rate,
    'last_processor_run', last_processor_run,
    'alerts', alerts
  );

  -- Store health report
  INSERT INTO system_settings (key_name, key_value, description, category)
  VALUES (
    'SHOPIFY_QUEUE_HEALTH_LAST_CHECK',
    health_report::text,
    'Last queue health check result',
    'monitoring'
  )
  ON CONFLICT (key_name) DO UPDATE SET
    key_value = EXCLUDED.key_value,
    updated_at = now();

  RETURN health_report;
END;
$function$;