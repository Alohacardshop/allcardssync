
-- Atomically claim the next available Shopify sync job
CREATE OR REPLACE FUNCTION public.claim_shopify_sync_job(target_job_id uuid DEFAULT NULL)
RETURNS SETOF shopify_sync_job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed shopify_sync_job_queue;
BEGIN
  IF target_job_id IS NOT NULL THEN
    SELECT * INTO claimed
    FROM shopify_sync_job_queue
    WHERE id = target_job_id
      AND status IN ('queued', 'partial', 'running')
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    SELECT * INTO claimed
    FROM shopify_sync_job_queue
    WHERE status IN ('queued', 'partial')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE shopify_sync_job_queue
  SET status = 'running',
      started_at = COALESCE(started_at, now())
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;

-- Atomically claim up to N queued items for a given job
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
