-- Fix: Add admin role check to get_sync_queue_metrics function
-- Drop existing function first due to return type change

DROP FUNCTION IF EXISTS public.get_sync_queue_metrics(INTEGER);

CREATE OR REPLACE FUNCTION public.get_sync_queue_metrics(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
  total_items BIGINT,
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  avg_processing_time_ms NUMERIC,
  success_rate NUMERIC,
  items_per_hour NUMERIC
) AS $$
BEGIN
  -- Require admin role for metrics access
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required to view sync metrics';
  END IF;

  RETURN QUERY
  WITH time_window AS (
    SELECT * FROM shopify_sync_queue
    WHERE created_at >= now() - (hours_back || ' hours')::interval
  ),
  status_counts AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM time_window
  ),
  processing_stats AS (
    SELECT
      AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_ms
    FROM time_window
    WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
  )
  SELECT
    sc.total,
    sc.pending,
    sc.processing,
    sc.completed,
    sc.failed,
    COALESCE(ps.avg_ms, 0)::NUMERIC,
    CASE WHEN sc.total > 0 THEN (sc.completed::NUMERIC / sc.total * 100) ELSE 0 END,
    CASE WHEN hours_back > 0 THEN (sc.total::NUMERIC / hours_back) ELSE 0 END
  FROM status_counts sc
  CROSS JOIN processing_stats ps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;