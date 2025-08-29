-- Create RPC functions for the modern sync dashboard

-- Function to get recent sync jobs
CREATE OR REPLACE FUNCTION public.get_recent_sync_jobs(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
  id TEXT,
  job_type TEXT,
  status TEXT,
  source TEXT,
  game TEXT,
  set_id TEXT,
  total_items INTEGER,
  processed_items INTEGER,
  progress_percentage NUMERIC,
  items_per_second NUMERIC,
  estimated_completion_at TIMESTAMPTZ,
  error_message TEXT,
  results JSONB,
  metrics JSONB,
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'sync_v3', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id::TEXT,
    j.job_type::TEXT,
    j.status::TEXT,
    j.source,
    j.game,
    j.set_id,
    j.total_items,
    j.processed_items,
    j.progress_percentage,
    j.items_per_second,
    j.estimated_completion_at,
    j.error_message,
    j.results,
    j.metrics,
    j.created_at,
    j.started_at,
    j.completed_at
  FROM sync_v3.jobs j
  ORDER BY j.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Function to cancel a sync job
CREATE OR REPLACE FUNCTION public.cancel_sync_job(job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'sync_v3', 'public'
AS $$
BEGIN
  UPDATE sync_v3.jobs
  SET 
    status = 'cancelled',
    completed_at = now(),
    updated_at = now(),
    error_message = 'Cancelled by user'
  WHERE id = job_id;
END;
$$;