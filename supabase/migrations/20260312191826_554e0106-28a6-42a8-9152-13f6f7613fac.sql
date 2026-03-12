
-- 1. Unique constraint on (job_id, item_id) to prevent duplicate items in a job
ALTER TABLE public.shopify_sync_job_items
  ADD CONSTRAINT uq_shopify_sync_job_items_job_item UNIQUE (job_id, item_id);

-- 2. Add idempotency_key column to job queue
ALTER TABLE public.shopify_sync_job_queue
  ADD COLUMN idempotency_key text;

-- Partial unique index: only one unfinished job per idempotency_key
CREATE UNIQUE INDEX uq_shopify_sync_job_queue_idempotency_active
  ON public.shopify_sync_job_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('completed', 'failed', 'cancelled');
