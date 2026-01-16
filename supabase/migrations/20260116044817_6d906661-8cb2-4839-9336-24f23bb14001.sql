-- Clean up duplicate/legacy webhook secret entries
DELETE FROM system_settings 
WHERE key_name IN ('SHOPIFY_WEBHOOK_SECRET', 'SHOPIFY_WEBHOOK_SECRET_HAWAII');

-- Add webhook failure tracking columns if not exists
ALTER TABLE webhook_events 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;

-- Create index for failure monitoring
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created ON webhook_events(status, created_at DESC);

-- Create or replace function for webhook health stats
CREATE OR REPLACE FUNCTION get_webhook_health_stats()
RETURNS TABLE (
  total_count bigint,
  processed_count bigint,
  failed_count bigint,
  pending_count bigint,
  success_rate numeric,
  last_24h_total bigint,
  last_24h_failed bigint,
  avg_processing_time_seconds numeric
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint as total_count,
    COUNT(*) FILTER (WHERE status = 'processed')::bigint as processed_count,
    COUNT(*) FILTER (WHERE status = 'failed')::bigint as failed_count,
    COUNT(*) FILTER (WHERE status = 'pending')::bigint as pending_count,
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'processed')::numeric / NULLIF(COUNT(*), 0)) * 100,
      2
    ) as success_rate,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::bigint as last_24h_total,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'failed')::bigint as last_24h_failed,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))::numeric,
      2
    ) as avg_processing_time_seconds
  FROM webhook_events
  WHERE created_at > NOW() - INTERVAL '7 days';
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_webhook_health_stats() TO authenticated;