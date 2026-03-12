
-- Add retry budget fields to shopify_sync_job_items
ALTER TABLE public.shopify_sync_job_items
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz DEFAULT NULL;

-- Create index for efficient querying of retryable items
CREATE INDEX IF NOT EXISTS idx_sync_job_items_next_retry
  ON public.shopify_sync_job_items (job_id, status, next_retry_at)
  WHERE status = 'queued' AND next_retry_at IS NOT NULL;

-- Update claim_shopify_sync_job_items to respect next_retry_at
CREATE OR REPLACE FUNCTION public.claim_shopify_sync_job_items(
  p_job_id uuid,
  p_limit int DEFAULT 50
)
RETURNS SETOF shopify_sync_job_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT id
    FROM shopify_sync_job_items
    WHERE job_id = p_job_id
      AND status = 'queued'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE shopify_sync_job_items si
  SET status = 'running',
      attempt_count = si.attempt_count + 1,
      updated_at = now()
  FROM to_claim
  WHERE si.id = to_claim.id
  RETURNING si.*;
END;
$$;
