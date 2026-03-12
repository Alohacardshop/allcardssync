
-- Queue-based Shopify sync job tracking
CREATE TABLE public.shopify_sync_job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  store_key text NOT NULL,
  location_gid text NOT NULL,
  vendor text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','partial','cancelled')),
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  total_api_calls integer NOT NULL DEFAULT 0,
  total_duration_ms integer NOT NULL DEFAULT 0,
  triggered_by text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.shopify_sync_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.shopify_sync_job_queue(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  shopify_product_id text,
  shopify_variant_id text,
  api_calls integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_job_queue_status ON public.shopify_sync_job_queue(status);
CREATE INDEX idx_sync_job_queue_created ON public.shopify_sync_job_queue(created_at DESC);
CREATE INDEX idx_sync_job_items_job_id ON public.shopify_sync_job_items(job_id);
CREATE INDEX idx_sync_job_items_status ON public.shopify_sync_job_items(status);

ALTER TABLE public.shopify_sync_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_sync_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sync jobs"
  ON public.shopify_sync_job_queue FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read sync job items"
  ON public.shopify_sync_job_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage sync jobs"
  ON public.shopify_sync_job_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage sync job items"
  ON public.shopify_sync_job_items FOR ALL TO service_role USING (true) WITH CHECK (true);
