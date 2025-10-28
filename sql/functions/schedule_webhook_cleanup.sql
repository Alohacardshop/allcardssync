-- Scheduled webhook cleanup function
-- This should be called by a cron job (e.g., pg_cron) to automatically clean old webhook events

-- Function to perform cleanup and return stats
CREATE OR REPLACE FUNCTION scheduled_webhook_cleanup(
  retention_days INTEGER DEFAULT 90,
  batch_size INTEGER DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
  total_deleted INTEGER := 0;
  old_processed_count INTEGER;
  old_failed_count INTEGER;
  cleanup_stats jsonb;
BEGIN
  -- Count what we're about to delete
  SELECT
    COUNT(*) FILTER (WHERE status = 'processed'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO old_processed_count, old_failed_count
  FROM webhook_events
  WHERE created_at < (NOW() - (retention_days || ' days')::INTERVAL);

  -- Delete in batches to avoid long locks
  LOOP
    DELETE FROM webhook_events
    WHERE id IN (
      SELECT id FROM webhook_events
      WHERE created_at < (NOW() - (retention_days || ' days')::INTERVAL)
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    
    EXIT WHEN deleted_count = 0;
    
    -- Small delay between batches
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- Build result stats
  cleanup_stats := jsonb_build_object(
    'deleted_total', total_deleted,
    'deleted_processed', old_processed_count,
    'deleted_failed', old_failed_count,
    'retention_days', retention_days,
    'cleanup_timestamp', NOW()
  );

  -- Log the cleanup
  INSERT INTO system_logs (level, message, context, source)
  VALUES (
    'info',
    'Scheduled webhook cleanup completed',
    cleanup_stats,
    'scheduled_webhook_cleanup'
  );

  RETURN cleanup_stats;
END;
$$;

-- Function to check if cleanup is needed
CREATE OR REPLACE FUNCTION webhook_cleanup_needed(
  retention_days INTEGER DEFAULT 90,
  threshold_count INTEGER DEFAULT 10000
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) >= threshold_count
  FROM webhook_events
  WHERE created_at < (NOW() - (retention_days || ' days')::INTERVAL);
$$;

-- Manual cleanup function (for admin use)
CREATE OR REPLACE FUNCTION admin_cleanup_webhooks(
  retention_days INTEGER DEFAULT 90,
  status_filter TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
  cleanup_result jsonb;
BEGIN
  -- Only admins can run this
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Delete based on filters
  IF status_filter IS NULL THEN
    DELETE FROM webhook_events
    WHERE created_at < (NOW() - (retention_days || ' days')::INTERVAL);
  ELSE
    DELETE FROM webhook_events
    WHERE created_at < (NOW() - (retention_days || ' days')::INTERVAL)
      AND status = status_filter;
  END IF;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  cleanup_result := jsonb_build_object(
    'deleted_count', deleted_count,
    'retention_days', retention_days,
    'status_filter', COALESCE(status_filter, 'all'),
    'admin_user_id', auth.uid(),
    'cleanup_timestamp', NOW()
  );

  -- Log the action
  INSERT INTO system_logs (level, message, context, source, user_id)
  VALUES (
    'info',
    'Admin webhook cleanup executed',
    cleanup_result,
    'admin_cleanup_webhooks',
    auth.uid()
  );

  RETURN cleanup_result;
END;
$$;

-- Example usage:
-- Manual one-time cleanup (admin only):
-- SELECT admin_cleanup_webhooks(90); -- Delete webhooks older than 90 days
-- SELECT admin_cleanup_webhooks(30, 'processed'); -- Delete processed webhooks older than 30 days

-- Scheduled cleanup (for cron job):
-- SELECT scheduled_webhook_cleanup(90, 1000); -- Clean 90+ day old webhooks in batches of 1000

-- Check if cleanup is needed:
-- SELECT webhook_cleanup_needed(90, 10000); -- Returns true if more than 10k old webhooks exist
