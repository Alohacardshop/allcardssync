-- Webhook Health Monitoring View
-- This view provides a comprehensive overview of webhook processing health

CREATE OR REPLACE VIEW webhook_health_stats AS
SELECT
  -- Overall stats
  COUNT(*) as total_webhooks,
  COUNT(*) FILTER (WHERE status = 'processed') as processed_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  
  -- Success rate
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'processed')::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate_percent,
  
  -- Recent activity (last 24 hours)
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h_count,
  COUNT(*) FILTER (
    WHERE created_at > NOW() - INTERVAL '24 hours' 
    AND status = 'failed'
  ) as last_24h_failed,
  
  -- Recent activity (last hour)
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour_count,
  COUNT(*) FILTER (
    WHERE created_at > NOW() - INTERVAL '1 hour' 
    AND status = 'failed'
  ) as last_hour_failed,
  
  -- Processing time stats
  ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))::numeric, 2) as avg_processing_time_seconds,
  ROUND(MAX(EXTRACT(EPOCH FROM (processed_at - created_at)))::numeric, 2) as max_processing_time_seconds
FROM webhook_events;

-- Webhook health by topic
CREATE OR REPLACE VIEW webhook_health_by_topic AS
SELECT
  topic,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE status = 'processed') as processed_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'processed')::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate_percent,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h_count,
  MAX(created_at) as last_received_at
FROM webhook_events
GROUP BY topic
ORDER BY total_count DESC;

-- Recent failed webhooks for investigation
CREATE OR REPLACE VIEW recent_failed_webhooks AS
SELECT
  id,
  topic,
  webhook_id,
  shop_domain,
  error_message,
  payload,
  created_at,
  processed_at,
  EXTRACT(EPOCH FROM (processed_at - created_at)) as processing_time_seconds
FROM webhook_events
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;

-- Webhook processing timeline (hourly buckets for last 7 days)
CREATE OR REPLACE VIEW webhook_timeline AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_webhooks,
  COUNT(*) FILTER (WHERE status = 'processed') as processed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'processed')::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) as success_rate
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Duplicate webhook detection (potential issues with idempotency)
CREATE OR REPLACE VIEW potential_duplicate_webhooks AS
SELECT
  webhook_id,
  topic,
  shop_domain,
  COUNT(*) as occurrence_count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  ARRAY_AGG(DISTINCT status) as statuses
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY webhook_id, topic, shop_domain
HAVING COUNT(*) > 1
ORDER BY occurrence_count DESC;

-- Grant access to staff and admin roles
GRANT SELECT ON webhook_health_stats TO authenticated;
GRANT SELECT ON webhook_health_by_topic TO authenticated;
GRANT SELECT ON recent_failed_webhooks TO authenticated;
GRANT SELECT ON webhook_timeline TO authenticated;
GRANT SELECT ON potential_duplicate_webhooks TO authenticated;

-- Add RLS policies for views (using underlying table policies)
ALTER VIEW webhook_health_stats SET (security_invoker = on);
ALTER VIEW webhook_health_by_topic SET (security_invoker = on);
ALTER VIEW recent_failed_webhooks SET (security_invoker = on);
ALTER VIEW webhook_timeline SET (security_invoker = on);
ALTER VIEW potential_duplicate_webhooks SET (security_invoker = on);
