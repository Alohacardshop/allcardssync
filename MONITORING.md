# Production Monitoring Guide

## Overview

This document outlines the monitoring strategy, key metrics, and alerting thresholds for the production environment.

## Monitoring Stack

- **Database**: Supabase built-in monitoring + custom queries
- **Application Logs**: `system_logs` table (structured logging)
- **Edge Functions**: Supabase Functions logs
- **Frontend**: Browser console (development) + structured logging (production)

## Key Metrics

### 1. Application Health

#### Circuit Breaker Status
**What**: Tracks circuit breaker state for external API calls
**Metric**: Circuit breaker open/closed state
**Query**:
```sql
SELECT 
  context->>'circuit_name' as circuit,
  context->>'state' as state,
  COUNT(*) as occurrences,
  MAX(created_at) as last_occurrence
FROM system_logs
WHERE message ILIKE '%circuit%breaker%'
AND created_at > now() - interval '1 hour'
GROUP BY circuit, state
ORDER BY last_occurrence DESC;
```

**Thresholds**:
- 🟢 **Normal**: All circuits closed
- 🟡 **Warning**: Circuit opened once in last hour
- 🔴 **Critical**: Circuit open for > 5 minutes

---

#### Queue Depth
**What**: Number of pending items in Shopify sync queue
**Metric**: Count of queued items
**Query**:
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (now() - created_at))) as avg_age_seconds
FROM shopify_sync_queue
GROUP BY status;
```

**Thresholds**:
- 🟢 **Normal**: < 100 queued items
- 🟡 **Warning**: 100-1000 queued items
- 🔴 **Critical**: > 1000 queued items OR items stuck > 10 minutes

---

#### Error Rate
**What**: Percentage of requests resulting in errors
**Metric**: Error count / total requests
**Query**:
```sql
SELECT 
  COUNT(*) FILTER (WHERE level = 'error') as error_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE level = 'error') / NULLIF(COUNT(*), 0), 2) as error_rate_pct
FROM system_logs
WHERE created_at > now() - interval '5 minutes';
```

**Thresholds**:
- 🟢 **Normal**: < 1% error rate
- 🟡 **Warning**: 1-5% error rate
- 🔴 **Critical**: > 5% error rate

---

### 2. Database Performance

#### Query Execution Time
**What**: Average query execution time
**Metric**: Mean execution time in milliseconds
**Query**:
```sql
SELECT 
  LEFT(query, 100) as query_start,
  calls,
  ROUND(mean_exec_time::numeric, 2) as avg_ms,
  ROUND(max_exec_time::numeric, 2) as max_ms,
  ROUND((total_exec_time / 1000)::numeric, 2) as total_seconds
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Thresholds**:
- 🟢 **Normal**: p95 < 500ms
- 🟡 **Warning**: p95 500-2000ms
- 🔴 **Critical**: p95 > 2000ms

---

#### Connection Pool Usage
**What**: Number of active database connections
**Metric**: Active connections / max connections
**Query**:
```sql
SELECT 
  COUNT(*) as active_connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
  ROUND(100.0 * COUNT(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) as usage_pct
FROM pg_stat_activity
WHERE state = 'active';
```

**Thresholds**:
- 🟢 **Normal**: < 70% usage
- 🟡 **Warning**: 70-90% usage
- 🔴 **Critical**: > 90% usage

---

#### Table Sizes
**What**: Size of main tables
**Metric**: Table size in MB
**Query**:
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

**Thresholds**:
- 🟢 **Normal**: < 5GB per table
- 🟡 **Warning**: 5-10GB per table
- 🔴 **Critical**: > 10GB per table (consider archival)

---

### 3. Business Metrics

#### Batch Processing Throughput
**What**: Number of batches completed per hour
**Metric**: Completed batches / hour
**Query**:
```sql
SELECT 
  DATE_TRUNC('hour', completed_at) as hour,
  COUNT(*) as batches_completed,
  SUM(total_items) as total_items,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time_seconds
FROM intake_lots
WHERE status = 'completed'
AND completed_at > now() - interval '24 hours'
GROUP BY DATE_TRUNC('hour', completed_at)
ORDER BY hour DESC;
```

**Thresholds**:
- 🟢 **Normal**: > 10 batches/hour during business hours
- 🟡 **Warning**: 5-10 batches/hour
- 🔴 **Critical**: < 5 batches/hour (during business hours)

---

#### Shopify Sync Success Rate
**What**: Percentage of successful Shopify syncs
**Metric**: Completed syncs / total syncs
**Query**:
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 2) as success_rate_pct
FROM shopify_sync_queue
WHERE created_at > now() - interval '1 hour';
```

**Thresholds**:
- 🟢 **Normal**: > 95% success rate
- 🟡 **Warning**: 90-95% success rate
- 🔴 **Critical**: < 90% success rate

---

#### Failed Operations
**What**: Number of operations requiring manual intervention
**Metric**: Count of failed items
**Query**:
```sql
SELECT 
  'shopify_sync' as operation_type,
  COUNT(*) as failed_count
FROM shopify_sync_queue
WHERE status = 'failed'
AND retry_count >= max_retries

UNION ALL

SELECT 
  'batch_processing' as operation_type,
  COUNT(*) as failed_count
FROM intake_lots
WHERE status = 'active'
AND created_at < now() - interval '1 hour';
```

**Thresholds**:
- 🟢 **Normal**: 0 failed operations
- 🟡 **Warning**: 1-5 failed operations
- 🔴 **Critical**: > 5 failed operations

---

## Recommended Alerts

### Critical Alerts (Page Immediately)

```sql
-- Alert: Circuit breaker open for > 5 minutes
SELECT 
  'CRITICAL: Circuit breaker open' as alert,
  context->>'circuit_name' as circuit,
  context->>'reason' as reason,
  MAX(created_at) as last_occurrence
FROM system_logs
WHERE message ILIKE '%circuit%breaker%open%'
AND created_at > now() - interval '5 minutes'
GROUP BY circuit, reason;

-- Alert: Error rate > 10%
SELECT 
  'CRITICAL: High error rate' as alert,
  ROUND(100.0 * COUNT(*) FILTER (WHERE level = 'error') / NULLIF(COUNT(*), 0), 2) as error_rate_pct
FROM system_logs
WHERE created_at > now() - interval '5 minutes'
HAVING COUNT(*) FILTER (WHERE level = 'error') > 0.1 * COUNT(*);

-- Alert: Database connections exhausted
SELECT 
  'CRITICAL: Connection pool exhausted' as alert,
  COUNT(*) as active_connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
FROM pg_stat_activity
WHERE state = 'active'
HAVING COUNT(*) > 0.9 * (SELECT setting::int FROM pg_settings WHERE name = 'max_connections');
```

### Warning Alerts (Review within 1 hour)

```sql
-- Alert: Queue depth > 1000
SELECT 
  'WARNING: High queue depth' as alert,
  status,
  COUNT(*) as count
FROM shopify_sync_queue
GROUP BY status
HAVING COUNT(*) > 1000;

-- Alert: Slow queries detected
SELECT 
  'WARNING: Slow queries detected' as alert,
  LEFT(query, 100) as query_start,
  ROUND(mean_exec_time::numeric, 2) as avg_ms
FROM pg_stat_statements
WHERE mean_exec_time > 5000  -- > 5 seconds
AND query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Alert: Failed syncs increasing
SELECT 
  'WARNING: High Shopify sync failure rate' as alert,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 2) as failure_rate_pct
FROM shopify_sync_queue
WHERE created_at > now() - interval '1 hour'
HAVING COUNT(*) FILTER (WHERE status = 'failed') > 0.1 * COUNT(*);
```

### Info Alerts (Review daily)

```sql
-- Alert: Old logs accumulating
SELECT 
  'INFO: Old logs should be archived' as alert,
  COUNT(*) as old_log_count,
  pg_size_pretty(pg_total_relation_size('public.system_logs')) as table_size
FROM system_logs
WHERE created_at < now() - interval '90 days';

-- Alert: Stale batches
SELECT 
  'INFO: Stale batches detected' as alert,
  COUNT(*) as stale_batch_count
FROM intake_lots
WHERE status = 'active'
AND created_at < now() - interval '24 hours';
```

---

## Monitoring Dashboard

### Recommended Layout

**Section 1: System Health (Top)**
- Circuit breaker status (last 1 hour)
- Error rate (last 5 minutes)
- Queue depth (current)
- Active connections (current)

**Section 2: Performance Metrics (Middle)**
- Query execution times (p50, p95, p99)
- API response times
- Batch processing throughput (last 24 hours)
- Shopify sync success rate (last 1 hour)

**Section 3: Business Metrics (Bottom)**
- Batches completed today
- Items processed today
- Failed operations requiring attention
- Top errors (last 24 hours)

---

## Custom Monitoring Queries

### Health Check Query (Run every 5 minutes)
```sql
WITH metrics AS (
  SELECT 
    (SELECT COUNT(*) FROM shopify_sync_queue WHERE status = 'queued') as queue_depth,
    (SELECT COUNT(*) FROM system_logs WHERE level = 'error' AND created_at > now() - interval '5 minutes') as recent_errors,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
    (SELECT COUNT(*) FROM intake_lots WHERE status = 'active' AND created_at < now() - interval '1 hour') as stale_batches
)
SELECT 
  CASE 
    WHEN queue_depth > 1000 THEN 'CRITICAL'
    WHEN queue_depth > 100 THEN 'WARNING'
    ELSE 'OK'
  END as queue_status,
  CASE 
    WHEN recent_errors > 50 THEN 'CRITICAL'
    WHEN recent_errors > 10 THEN 'WARNING'
    ELSE 'OK'
  END as error_status,
  CASE 
    WHEN active_connections > 90 THEN 'CRITICAL'
    WHEN active_connections > 70 THEN 'WARNING'
    ELSE 'OK'
  END as connection_status,
  CASE 
    WHEN stale_batches > 5 THEN 'WARNING'
    ELSE 'OK'
  END as batch_status,
  *
FROM metrics;
```

### Daily Summary Query
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_logs,
  COUNT(*) FILTER (WHERE level = 'error') as errors,
  COUNT(*) FILTER (WHERE level = 'warn') as warnings,
  COUNT(DISTINCT source) as unique_sources,
  jsonb_object_agg(
    level,
    COUNT(*)
  ) as logs_by_level
FROM system_logs
WHERE created_at > CURRENT_DATE - interval '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Integration with External Tools

### Recommended Tools

**Application Performance Monitoring (APM)**:
- Sentry (error tracking)
- Datadog (metrics and logs)
- New Relic (full stack monitoring)

**Uptime Monitoring**:
- UptimeRobot (external health checks)
- Pingdom (endpoint monitoring)
- StatusCake (multi-location checks)

**Log Aggregation**:
- Supabase built-in logs (included)
- Papertrail (centralized logging)
- Loggly (log analysis)

### Setup Steps

1. **Configure Webhook for Alerts**:
```sql
-- Create webhook notification function
CREATE OR REPLACE FUNCTION notify_webhook_on_critical_error()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.level = 'error' THEN
    PERFORM net.http_post(
      url := 'https://your-monitoring-service.com/webhook',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'alert', 'Critical error logged',
        'message', NEW.message,
        'source', NEW.source,
        'timestamp', NEW.created_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Attach trigger
CREATE TRIGGER trigger_webhook_on_critical_error
AFTER INSERT ON system_logs
FOR EACH ROW
WHEN (NEW.level = 'error')
EXECUTE FUNCTION notify_webhook_on_critical_error();
```

2. **Export Metrics to External Service**:
```typescript
// Example: Export metrics to Datadog
async function exportMetricsToDatadog() {
  const metrics = await supabase.rpc('get_health_metrics');
  
  await fetch('https://api.datadoghq.com/api/v1/series', {
    method: 'POST',
    headers: {
      'DD-API-KEY': process.env.DATADOG_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      series: [
        {
          metric: 'shopify.queue.depth',
          points: [[Date.now() / 1000, metrics.queue_depth]],
          type: 'gauge'
        }
      ]
    })
  });
}
```

---

**Last Updated**: 2025-10-27
**Owner**: DevOps Team
**Next Review**: Monthly
