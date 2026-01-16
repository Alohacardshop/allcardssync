-- Phase 1: Dead-Letter Queue
CREATE TABLE public.shopify_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id UUID NOT NULL,
  inventory_item_id UUID NOT NULL,
  action TEXT NOT NULL,
  error_message TEXT,
  error_type TEXT,
  retry_count INTEGER DEFAULT 0,
  item_snapshot JSONB,
  failure_context JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX idx_dead_letter_created ON public.shopify_dead_letter_queue(created_at DESC);
CREATE INDEX idx_dead_letter_error_type ON public.shopify_dead_letter_queue(error_type);
CREATE INDEX idx_dead_letter_unresolved ON public.shopify_dead_letter_queue(resolved_at) WHERE resolved_at IS NULL;

-- Failure analysis view
CREATE OR REPLACE VIEW public.dead_letter_failure_analysis AS
SELECT 
  error_type,
  COUNT(*) as failure_count,
  MIN(created_at) as first_failure,
  MAX(created_at) as last_failure,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_count
FROM public.shopify_dead_letter_queue
GROUP BY error_type
ORDER BY failure_count DESC;

-- Phase 2: Product Cache
CREATE TABLE public.shopify_product_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  store_key TEXT NOT NULL,
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  shopify_inventory_item_id TEXT,
  cached_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  UNIQUE(sku, store_key)
);

CREATE INDEX idx_product_cache_lookup ON public.shopify_product_cache(sku, store_key);
CREATE INDEX idx_product_cache_expires ON public.shopify_product_cache(expires_at);

-- Phase 3: Processing Metrics Function
CREATE OR REPLACE FUNCTION public.get_sync_queue_metrics(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
  total_processed BIGINT,
  total_failed BIGINT,
  avg_processing_time_ms NUMERIC,
  max_processing_time_ms NUMERIC,
  items_per_hour NUMERIC,
  success_rate NUMERIC,
  by_action JSONB,
  by_hour JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH time_window AS (
    SELECT * FROM shopify_sync_queue
    WHERE created_at >= now() - (hours_back || ' hours')::interval
  ),
  completed_items AS (
    SELECT *,
      EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 as processing_ms
    FROM time_window
    WHERE status IN ('completed', 'failed') AND started_at IS NOT NULL AND completed_at IS NOT NULL
  ),
  hourly_stats AS (
    SELECT 
      date_trunc('hour', created_at) as hour,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM time_window
    GROUP BY date_trunc('hour', created_at)
    ORDER BY hour DESC
    LIMIT 24
  ),
  action_stats AS (
    SELECT 
      action,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      AVG(CASE WHEN status IN ('completed', 'failed') AND started_at IS NOT NULL AND completed_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 END) as avg_ms
    FROM time_window
    GROUP BY action
  )
  SELECT
    (SELECT COUNT(*) FROM time_window WHERE status = 'completed')::BIGINT,
    (SELECT COUNT(*) FROM time_window WHERE status = 'failed')::BIGINT,
    ROUND((SELECT AVG(processing_ms) FROM completed_items), 2),
    ROUND((SELECT MAX(processing_ms) FROM completed_items), 2),
    ROUND((SELECT COUNT(*)::NUMERIC / NULLIF(hours_back, 0) FROM time_window WHERE status = 'completed'), 2),
    ROUND((SELECT COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC * 100 / NULLIF(COUNT(*), 0) FROM time_window WHERE status IN ('completed', 'failed')), 2),
    (SELECT jsonb_agg(jsonb_build_object('action', action, 'total', total, 'completed', completed, 'failed', failed, 'avg_ms', ROUND(avg_ms, 2))) FROM action_stats),
    (SELECT jsonb_agg(jsonb_build_object('hour', hour, 'count', count, 'completed', completed, 'failed', failed) ORDER BY hour DESC) FROM hourly_stats);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Phase 4: Log cleanup index
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created ON public.system_logs(level, created_at DESC);

-- Enable RLS
ALTER TABLE public.shopify_dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_product_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (admin tables)
CREATE POLICY "Allow authenticated access to dead_letter_queue" ON public.shopify_dead_letter_queue
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated access to product_cache" ON public.shopify_product_cache
  FOR ALL USING (true) WITH CHECK (true);