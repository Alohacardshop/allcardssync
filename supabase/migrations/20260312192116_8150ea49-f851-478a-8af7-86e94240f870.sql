
-- 1. Add lease/heartbeat columns to job queue
ALTER TABLE public.shopify_sync_job_queue
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN claimed_by text;

-- 2. Replace claim_shopify_sync_job to set heartbeat and lease on claim
CREATE OR REPLACE FUNCTION public.claim_shopify_sync_job(
  target_job_id uuid DEFAULT NULL,
  lease_duration_seconds int DEFAULT 300,
  worker_id text DEFAULT NULL
)
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
      started_at = COALESCE(started_at, now()),
      heartbeat_at = now(),
      lease_expires_at = now() + (lease_duration_seconds || ' seconds')::interval,
      claimed_by = COALESCE(worker_id, claimed_by)
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;

-- 3. Function to refresh heartbeat and extend lease
CREATE OR REPLACE FUNCTION public.refresh_shopify_sync_job_lease(
  p_job_id uuid,
  lease_duration_seconds int DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE shopify_sync_job_queue
  SET heartbeat_at = now(),
      lease_expires_at = now() + (lease_duration_seconds || ' seconds')::interval
  WHERE id = p_job_id
    AND status = 'running';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- 4. Function to reclaim stale jobs whose lease has expired
CREATE OR REPLACE FUNCTION public.reclaim_stale_shopify_sync_jobs()
RETURNS TABLE(job_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_job record;
  item_counts record;
  reclaim_status text;
BEGIN
  FOR stale_job IN
    SELECT *
    FROM shopify_sync_job_queue
    WHERE status = 'running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Determine new status based on processed items
    SELECT
      COUNT(*) FILTER (WHERE si.status IN ('succeeded', 'failed', 'blocked')) AS processed,
      COUNT(*) FILTER (WHERE si.status IN ('queued', 'running')) AS remaining
    INTO item_counts
    FROM shopify_sync_job_items si
    WHERE si.job_id = stale_job.id;

    IF item_counts.processed > 0 THEN
      reclaim_status := 'partial';
    ELSE
      reclaim_status := 'queued';
    END IF;

    -- Reset running items back to queued
    UPDATE shopify_sync_job_items
    SET status = 'queued', updated_at = now()
    WHERE shopify_sync_job_items.job_id = stale_job.id
      AND shopify_sync_job_items.status = 'running';

    -- Update job status
    UPDATE shopify_sync_job_queue
    SET status = reclaim_status,
        heartbeat_at = NULL,
        lease_expires_at = NULL,
        claimed_by = NULL
    WHERE id = stale_job.id;

    job_id := stale_job.id;
    previous_status := 'running';
    new_status := reclaim_status;
    RETURN NEXT;
  END LOOP;
END;
$$;
