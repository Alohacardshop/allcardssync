-- Update sync_v3.config with Premium API plan settings
INSERT INTO sync_v3.config (key, value, description, category) VALUES
-- Premium batch sizes (much higher than current 25/10)
('batch_size_cards', '200', 'Premium plan: Cards per API request (max limit)', 'performance'),
('batch_size_sets', '100', 'Premium plan: Sets per API request (increased from 50)', 'performance'),
('batch_size_variants', '200', 'Premium plan: Variants per request', 'performance'),

-- Premium rate limits (500 req/min = ~120ms delay, using 150ms for safety)
('api_rate_limit_ms', '150', 'Premium plan: Delay between API calls (500 req/min)', 'performance'),
('requests_per_minute', '400', 'Premium plan: Safe request rate (below 500 limit)', 'performance'),

-- Parallel processing settings
('parallel_set_count', '3', 'Number of sets to process concurrently', 'performance'),
('db_batch_size', '50', 'Database batch insert size for faster writes', 'performance'),
('connection_pool_size', '10', 'Database connection pool size', 'performance'),

-- Progress tracking improvements
('progress_update_interval_cards', '50', 'Update progress every N cards (was 10)', 'monitoring'),
('progress_update_interval_sets', '20', 'Update progress every N sets (was 10)', 'monitoring'),
('show_realtime_stats', 'true', 'Show cards-per-second and ETA in real-time', 'monitoring'),

-- API timeout and retry settings
('api_timeout_ms', '60000', 'API request timeout (60 seconds)', 'reliability'),
('max_retries', '3', 'Maximum API retry attempts', 'reliability'),

-- Premium API usage monitoring
('track_api_usage', 'true', 'Track API usage vs daily/monthly limits', 'monitoring'),
('usage_alert_threshold', '0.8', 'Alert when usage exceeds 80% of limits', 'monitoring'),
('usage_check_interval_minutes', '30', 'Check API usage every 30 minutes', 'monitoring'),

-- Performance logging
('detailed_performance_logging', 'true', 'Enable detailed sync performance logs', 'monitoring'),
('log_sync_speed_improvements', 'true', 'Log performance improvements vs baseline', 'monitoring'),
('baseline_cards_per_second', '5', 'Baseline performance for comparison', 'monitoring')

ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

-- Create API usage tracking table
CREATE TABLE IF NOT EXISTS sync_v3.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  hour INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'justtcg',
  requests_count INTEGER NOT NULL DEFAULT 0,
  requests_limit INTEGER NOT NULL DEFAULT 500,
  daily_requests INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50000,
  monthly_requests INTEGER NOT NULL DEFAULT 0,
  monthly_limit INTEGER NOT NULL DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, hour, provider)
);

-- Create performance baselines table
CREATE TABLE IF NOT EXISTS sync_v3.performance_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'games', 'sets', 'cards'
  game TEXT,
  baseline_items_per_second NUMERIC NOT NULL,
  baseline_api_requests_per_item NUMERIC NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sync_type, game)
);

-- Insert initial performance baselines (current performance)
INSERT INTO sync_v3.performance_baselines (sync_type, game, baseline_items_per_second, baseline_api_requests_per_item)
VALUES 
  ('games', NULL, 5.0, 1.0),
  ('sets', 'pokemon', 8.0, 1.0),
  ('sets', 'mtg', 6.0, 1.0),
  ('cards', 'pokemon', 3.0, 2.0),
  ('cards', 'mtg', 2.5, 2.0)
ON CONFLICT (sync_type, game) DO NOTHING;

-- Function to record API usage
CREATE OR REPLACE FUNCTION sync_v3.record_api_usage(
  provider_name TEXT DEFAULT 'justtcg',
  request_count INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO sync_v3.api_usage (
    date, hour, provider, requests_count, daily_requests, monthly_requests
  )
  VALUES (
    CURRENT_DATE,
    EXTRACT(HOUR FROM NOW())::INTEGER,
    provider_name,
    request_count,
    request_count,
    request_count
  )
  ON CONFLICT (date, hour, provider) DO UPDATE SET
    requests_count = sync_v3.api_usage.requests_count + request_count,
    daily_requests = sync_v3.api_usage.daily_requests + request_count,
    monthly_requests = sync_v3.api_usage.monthly_requests + request_count,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current API usage
CREATE OR REPLACE FUNCTION sync_v3.get_api_usage_stats(
  provider_name TEXT DEFAULT 'justtcg'
) RETURNS JSONB AS $$
DECLARE
  current_hour_usage INTEGER;
  daily_usage INTEGER;
  monthly_usage INTEGER;
  result JSONB;
BEGIN
  -- Get current hour usage
  SELECT COALESCE(requests_count, 0) INTO current_hour_usage
  FROM sync_v3.api_usage
  WHERE date = CURRENT_DATE 
    AND hour = EXTRACT(HOUR FROM NOW())::INTEGER
    AND provider = provider_name;

  -- Get daily usage
  SELECT COALESCE(SUM(requests_count), 0) INTO daily_usage
  FROM sync_v3.api_usage
  WHERE date = CURRENT_DATE AND provider = provider_name;

  -- Get monthly usage
  SELECT COALESCE(SUM(requests_count), 0) INTO monthly_usage
  FROM sync_v3.api_usage
  WHERE date >= DATE_TRUNC('month', CURRENT_DATE) 
    AND provider = provider_name;

  result := jsonb_build_object(
    'provider', provider_name,
    'current_hour', jsonb_build_object(
      'requests', COALESCE(current_hour_usage, 0),
      'limit', 500,
      'percentage', ROUND((COALESCE(current_hour_usage, 0)::NUMERIC / 500) * 100, 2)
    ),
    'daily', jsonb_build_object(
      'requests', daily_usage,
      'limit', 50000,
      'percentage', ROUND((daily_usage::NUMERIC / 50000) * 100, 2)
    ),
    'monthly', jsonb_build_object(
      'requests', monthly_usage,
      'limit', 1000000,
      'percentage', ROUND((monthly_usage::NUMERIC / 1000000) * 100, 2)
    ),
    'timestamp', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_api_usage_date_hour ON sync_v3.api_usage(date, hour, provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider_date ON sync_v3.api_usage(provider, date);