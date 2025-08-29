-- Advanced sync system enhancements

-- Configuration table for sync parameters
CREATE TABLE IF NOT EXISTS sync_v3.config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Performance metrics tracking
CREATE TABLE IF NOT EXISTS sync_v3.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES sync_v3.jobs(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL, -- 'performance', 'api_usage', 'memory'
  data JSONB NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Error categorization and tracking
CREATE TABLE IF NOT EXISTS sync_v3.errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES sync_v3.jobs(id) ON DELETE CASCADE,
  error_code TEXT,
  error_category TEXT, -- 'network', 'api_limit', 'validation', 'system'
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  retry_count INTEGER DEFAULT 0,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Health check status
CREATE TABLE IF NOT EXISTS sync_v3.health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL, -- 'justtcg_api', 'database', 'system'
  status TEXT NOT NULL, -- 'healthy', 'degraded', 'down'
  response_time_ms INTEGER,
  details JSONB,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Scheduled sync jobs
CREATE TABLE IF NOT EXISTS sync_v3.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  schedule_cron TEXT NOT NULL, -- cron expression
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP WITH TIME ZONE,
  next_run TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Webhook configurations
CREATE TABLE IF NOT EXISTS sync_v3.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL, -- ['job_completed', 'job_failed', 'health_alert']
  headers JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  secret TEXT, -- for webhook verification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default configuration values
INSERT INTO sync_v3.config (key, value, description, category) VALUES
  ('batch_size_cards', '25', 'Default batch size for card processing', 'performance'),
  ('batch_size_sets', '10', 'Default batch size for set processing', 'performance'),
  ('api_rate_limit_ms', '100', 'Minimum delay between API calls in milliseconds', 'performance'),
  ('max_retries', '3', 'Maximum number of retries for failed operations', 'reliability'),
  ('memory_threshold_mb', '256', 'Memory usage threshold for optimization triggers', 'performance'),
  ('health_check_interval_minutes', '5', 'Interval for health checks in minutes', 'monitoring'),
  ('metrics_retention_days', '30', 'Number of days to retain performance metrics', 'cleanup'),
  ('webhook_timeout_seconds', '10', 'Timeout for webhook requests in seconds', 'webhooks')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_metrics_job_id ON sync_v3.metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_metrics_type_recorded ON sync_v3.metrics(metric_type, recorded_at);
CREATE INDEX IF NOT EXISTS idx_errors_job_id ON sync_v3.errors(job_id);
CREATE INDEX IF NOT EXISTS idx_errors_category_created ON sync_v3.errors(error_category, created_at);
CREATE INDEX IF NOT EXISTS idx_health_checks_service_checked ON sync_v3.health_checks(service_name, checked_at);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled_next_run ON sync_v3.schedules(enabled, next_run);

-- RLS policies for new tables
ALTER TABLE sync_v3.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_v3.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_v3.errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_v3.health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_v3.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_v3.webhooks ENABLE ROW LEVEL SECURITY;

-- Admin access policies
CREATE POLICY "Admins can manage config" ON sync_v3.config FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view metrics" ON sync_v3.metrics FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view errors" ON sync_v3.errors FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view health checks" ON sync_v3.health_checks FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage schedules" ON sync_v3.schedules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage webhooks" ON sync_v3.webhooks FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Helper functions for configuration
CREATE OR REPLACE FUNCTION sync_v3.get_config(config_key TEXT)
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT value FROM sync_v3.config WHERE key = config_key;
$$;

CREATE OR REPLACE FUNCTION sync_v3.set_config(config_key TEXT, config_value JSONB)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO sync_v3.config (key, value) VALUES (config_key, config_value)
  ON CONFLICT (key) DO UPDATE SET value = config_value, updated_at = now();
$$;

-- Health check function
CREATE OR REPLACE FUNCTION sync_v3.record_health_check(
  service TEXT,
  health_status TEXT,
  response_ms INTEGER DEFAULT NULL,
  check_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO sync_v3.health_checks (service_name, status, response_time_ms, details)
  VALUES (service, health_status, response_ms, check_details)
  RETURNING id;
$$;

-- Performance metrics function
CREATE OR REPLACE FUNCTION sync_v3.record_metric(
  job_uuid UUID,
  metric_type_name TEXT,
  metric_data JSONB
)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO sync_v3.metrics (job_id, metric_type, data)
  VALUES (job_uuid, metric_type_name, metric_data)
  RETURNING id;
$$;

-- Error tracking function
CREATE OR REPLACE FUNCTION sync_v3.record_error(
  job_uuid UUID,
  error_code_val TEXT,
  error_category_val TEXT,
  error_msg TEXT,
  stack_trace_val TEXT DEFAULT NULL,
  error_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO sync_v3.errors (job_id, error_code, error_category, error_message, stack_trace, context)
  VALUES (job_uuid, error_code_val, error_category_val, error_msg, stack_trace_val, error_context)
  RETURNING id;
$$;